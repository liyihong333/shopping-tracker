let currentPage = 'inventory';
let inventoryFilter = 'all';
let recordMode = 'purchase';

const PAGE_META = {
  inventory: { title: '存量', subtitle: '按分类查看物品' },
  record: { title: '记录', subtitle: '添加购买或消耗' },
  stats: { title: '统计', subtitle: '购物与消耗概览' },
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
}

function renderInventory() {
  const items = loadItems().filter((i) => i.quantity > 0);
  const filtered =
    inventoryFilter === 'all'
      ? items
      : items.filter((i) => i.category === inventoryFilter);

  const tabs = [
    { id: 'all', label: '全部' },
    ...Object.values(CATEGORIES),
  ];

  let html = `<div class="category-tabs">`;
  tabs.forEach((t) => {
    const id = t.id;
    const label = t.label || t.label;
    const active = inventoryFilter === id ? 'active' : '';
    const display = id === 'all' ? '全部' : `${t.icon || ''} ${t.label}`;
    html += `<button class="category-tab ${active}" data-filter="${id}">${display}</button>`;
  });
  html += `</div>`;

  if (filtered.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <p>暂无存量物品<br>去「记录」页面添加购买吧</p>
      </div>`;
  } else {
    const grouped = {};
    filtered.forEach((item) => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    Object.keys(CATEGORIES).forEach((cat) => {
      if (!grouped[cat]) return;
      const catInfo = CATEGORIES[cat];
      html += `<div class="section-title">${catInfo.icon} ${catInfo.label}</div>`;
      grouped[cat]
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        .forEach((item) => {
          const low = item.minStock > 0 && item.quantity <= item.minStock;
          html += `
            <div class="item-card ${low ? 'low-stock' : ''}" data-id="${item.id}">
              <div class="item-icon" style="background:${catInfo.color}18">${catInfo.icon}</div>
              <div class="item-info">
                <div class="item-name">${esc(item.name)}</div>
                <div class="item-meta">
                  ${item.sources.join('、')}
                  ${low ? '<span class="badge badge-warning">库存偏低</span>' : ''}
                </div>
              </div>
              <div class="item-qty">
                <div class="qty-number">${item.quantity}</div>
                <div class="qty-unit">${esc(item.unit)}</div>
              </div>
            </div>`;
        });
    });
  }

  $('#main-content').innerHTML = html;

  $$('.category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      inventoryFilter = btn.dataset.filter;
      renderInventory();
    });
  });

  $$('.item-card').forEach((card) => {
    card.addEventListener('click', () => showItemDetail(card.dataset.id));
  });
}

function showItemDetail(id) {
  const item = getItem(id);
  if (!item) return;
  const cat = CATEGORIES[item.category];

  const historyHtml = [...item.history]
    .reverse()
    .slice(0, 10)
    .map((h) => {
      const isPurchase = h.type === 'purchase';
      return `
        <div class="history-item">
          <div class="history-type ${h.type}">${isPurchase ? '🛒' : '📤'}</div>
          <div class="history-info">
            <div class="history-name">${isPurchase ? '购买' : '消耗'} ${h.amount} ${item.unit}</div>
            <div class="history-detail">${h.source || h.note || ''}</div>
          </div>
          <div class="history-date">${h.date}</div>
        </div>`;
    })
    .join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${esc(item.name)}</div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="item-card" style="margin-bottom:16px">
      <div class="item-icon" style="background:${cat.color}18">${cat.icon}</div>
      <div class="item-info">
        <div class="item-name">${cat.label}</div>
        <div class="item-meta">${item.sources.join('、')}</div>
      </div>
      <div class="item-qty">
        <div class="qty-number">${item.quantity}</div>
        <div class="qty-unit">${esc(item.unit)}</div>
      </div>
    </div>
    <div class="item-actions">
      <button class="btn btn-secondary btn-sm" id="btn-consume-quick">消耗</button>
      <button class="btn btn-secondary btn-sm" id="btn-edit-item">编辑</button>
      <button class="btn btn-danger btn-sm" id="btn-delete-item">删除</button>
    </div>
    <div class="section-title">最近记录</div>
    ${historyHtml || '<p style="color:var(--text-secondary);font-size:0.85rem">暂无记录</p>'}
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-consume-quick').addEventListener('click', () => {
    closeModal();
    currentPage = 'record';
    recordMode = 'consume';
    navigate('record');
    setTimeout(() => {
      const sel = $('#consume-item-select');
      if (sel) sel.value = id;
    }, 50);
  });
  $('#btn-edit-item').addEventListener('click', () => showEditItem(id));
  $('#btn-delete-item').addEventListener('click', () => {
    if (confirm(`确定删除「${item.name}」及其所有记录？`)) {
      deleteItem(id);
      closeModal();
      render();
      showToast('已删除');
    }
  });
}

function showEditItem(id) {
  const item = getItem(id);
  if (!item) return;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">编辑物品</div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <form id="edit-form">
      <div class="form-group">
        <label class="form-label">名称</label>
        <input class="form-input" name="name" value="${esc(item.name)}" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">当前存量</label>
          <input class="form-input" name="quantity" type="number" min="0" step="any" value="${item.quantity}" required />
        </div>
        <div class="form-group">
          <label class="form-label">预警阈值</label>
          <input class="form-input" name="minStock" type="number" min="0" step="any" value="${item.minStock || 0}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:12px">保存</button>
    </form>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    updateItem(id, {
      name: fd.get('name').trim(),
      quantity: parseFloat(fd.get('quantity')),
      minStock: parseFloat(fd.get('minStock')) || 0,
    });
    closeModal();
    render();
    showToast('已保存');
  });
}

function renderRecord() {
  const items = loadItems().filter((i) => i.quantity > 0);

  let html = `
    <div class="record-tabs">
      <button class="record-tab ${recordMode === 'purchase' ? 'active' : ''}" data-mode="purchase">购买入库</button>
      <button class="record-tab ${recordMode === 'consume' ? 'active' : ''}" data-mode="consume">消耗出库</button>
    </div>`;

  if (recordMode === 'purchase') {
    html += renderPurchaseForm();
  } else {
    html += renderConsumeForm(items);
  }

  $('#main-content').innerHTML = html;
  bindRecordEvents();
}

function renderPurchaseForm() {
  const today = new Date().toISOString().slice(0, 10);

  const catChips = Object.values(CATEGORIES)
    .map(
      (c, i) =>
        `<button type="button" class="chip ${i === 0 ? 'selected' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`
    )
    .join('');

  const sourceChips = SOURCES.map(
    (s, i) => `<button type="button" class="chip ${i === 0 ? 'selected' : ''}" data-source="${s}">${s}</button>`
  ).join('');

  const unitOptions = UNITS.map((u) => `<option value="${u}">${u}</option>`).join('');

  return `
    <div class="form-card">
      <form id="purchase-form">
        <div class="form-group">
          <label class="form-label">物品名称</label>
          <input class="form-input" name="name" placeholder="例如：洗衣液、苹果" required />
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <div class="chip-group" id="cat-chips">${catChips}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">数量</label>
            <input class="form-input" name="quantity" type="number" min="0.01" step="any" placeholder="1" required />
          </div>
          <div class="form-group">
            <label class="form-label">单位</label>
            <select class="form-select" name="unit">${unitOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">购买平台</label>
          <div class="chip-group" id="source-chips">${sourceChips}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">购买日期</label>
            <input class="form-input" name="date" type="date" value="${today}" required />
          </div>
          <div class="form-group">
            <label class="form-label">库存预警（可选）</label>
            <input class="form-input" name="minStock" type="number" min="0" step="any" placeholder="低于此值提醒" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">备注（可选）</label>
          <input class="form-input" name="note" placeholder="品牌、规格等" />
        </div>
        <button type="submit" class="btn btn-primary">确认入库</button>
      </form>
    </div>`;
}

function renderConsumeForm(items) {
  if (items.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📤</div>
        <p>没有可消耗的物品<br>请先记录购买入库</p>
      </div>`;
  }

  const options = items
    .map((i) => {
      const cat = CATEGORIES[i.category];
      return `<option value="${i.id}">${cat.icon} ${i.name}（余 ${i.quantity} ${i.unit}）</option>`;
    })
    .join('');

  return `
    <div class="form-card">
      <form id="consume-form">
        <div class="form-group">
          <label class="form-label">选择物品</label>
          <select class="form-select" id="consume-item-select" name="itemId">${options}</select>
        </div>
        <div class="form-group">
          <label class="form-label">消耗数量</label>
          <input class="form-input" name="amount" type="number" min="0.01" step="any" placeholder="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">备注（可选）</label>
          <input class="form-input" name="note" placeholder="用途说明" />
        </div>
        <button type="submit" class="btn btn-primary">确认消耗</button>
      </form>
    </div>`;
}

function bindRecordEvents() {
  $$('.record-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      recordMode = btn.dataset.mode;
      renderRecord();
    });
  });

  bindChipGroup('#cat-chips', 'cat');
  bindChipGroup('#source-chips', 'source');

  const purchaseForm = $('#purchase-form');
  if (purchaseForm) {
    purchaseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const cat = document.querySelector('#cat-chips .chip.selected');
      const source = document.querySelector('#source-chips .chip.selected');

      addPurchase({
        name: fd.get('name').trim(),
        category: cat.dataset.cat,
        quantity: parseFloat(fd.get('quantity')),
        unit: fd.get('unit'),
        source: source.dataset.source,
        date: fd.get('date'),
        minStock: parseFloat(fd.get('minStock')) || 0,
        note: fd.get('note').trim(),
      });

      e.target.reset();
      document.querySelector('#cat-chips .chip').classList.add('selected');
      document.querySelector('#source-chips .chip').classList.add('selected');
      fd.set('date', new Date().toISOString().slice(0, 10));
      showToast('已入库 ✓');
    });
  }

  const consumeForm = $('#consume-form');
  if (consumeForm) {
    consumeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const result = consumeItem(fd.get('itemId'), parseFloat(fd.get('amount')), fd.get('note').trim());
      if (result && result.error) {
        showToast(result.error);
        return;
      }
      e.target.reset();
      renderRecord();
      showToast('已记录消耗');
    });
  }
}

function bindChipGroup(selector, dataKey) {
  const group = $(selector);
  if (!group) return;
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    group.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
  });
}

function renderStats() {
  const { byCategory, totalItems, lowStock, recentHistory } = getStats();
  const maxCount = Math.max(...Object.values(byCategory).map((c) => c.count), 1);

  let html = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${totalItems}</div>
        <div class="stat-label">存量物品种类</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${lowStock > 0 ? 'var(--warning)' : 'var(--primary)'}">${lowStock}</div>
        <div class="stat-label">库存偏低</div>
      </div>
    </div>
    <div class="section-title">分类分布</div>`;

  Object.entries(CATEGORIES).forEach(([id, cat]) => {
    const data = byCategory[id] || { count: 0, totalQty: 0 };
    const pct = Math.round((data.count / maxCount) * 100);
    html += `
      <div class="stat-cat-card">
        <div class="item-icon" style="background:${cat.color}18;width:36px;height:36px;font-size:1.1rem">${cat.icon}</div>
        <div style="flex:1">
          <div style="font-size:0.88rem;font-weight:600">${cat.label}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">${data.count} 种 · 共 ${data.totalQty} 件</div>
          <div class="stat-cat-bar" style="margin-top:6px">
            <div class="stat-cat-fill" style="width:${pct}%;background:${cat.color}"></div>
          </div>
        </div>
      </div>`;
  });

  html += `<div class="section-title">最近动态</div>`;

  if (recentHistory.length === 0) {
    html += `<div class="empty-state" style="padding:24px"><p>暂无记录</p></div>`;
  } else {
    recentHistory.forEach((h) => {
      const isPurchase = h.type === 'purchase';
      const cat = CATEGORIES[h.category];
      html += `
        <div class="history-item">
          <div class="history-type ${h.type}">${isPurchase ? '🛒' : '📤'}</div>
          <div class="history-info">
            <div class="history-name">${esc(h.itemName)} ${isPurchase ? '+' : '-'}${h.amount} ${h.unit}</div>
            <div class="history-detail">${cat.icon} ${cat.label}${h.source ? ' · ' + h.source : ''}${h.note ? ' · ' + esc(h.note) : ''}</div>
          </div>
          <div class="history-date">${h.date}</div>
        </div>`;
    });
  }

  $('#main-content').innerHTML = html;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function navigate(page) {
  currentPage = page;
  const meta = PAGE_META[page];
  $('#page-title').textContent = meta.title;
  $('#page-subtitle').textContent = meta.subtitle;

  $$('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  render();
}

function render() {
  if (currentPage === 'inventory') renderInventory();
  else if (currentPage === 'record') renderRecord();
  else if (currentPage === 'stats') renderStats();
}

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('#modal-overlay')) closeModal();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

navigate('inventory');
