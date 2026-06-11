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
  $('#modal').innerHTML = `<div class="modal-handle"></div>${html}`;
  $('#modal-overlay').classList.remove('hidden');
}

function updateHeaderDate() {
  const el = $('#header-date');
  if (!el) return;
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  el.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
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
  const lowCount = items.filter((i) => i.minStock > 0 && i.quantity <= i.minStock).length;

  const tabs = [
    { id: 'all', label: '全部' },
    ...Object.values(CATEGORIES),
  ];

  let html = `
    <div class="summary-row">
      <div class="summary-card" style="--card-accent: var(--accent)">
        <div class="summary-value">${items.length}</div>
        <div class="summary-label">在库种类</div>
      </div>
      <div class="summary-card ${lowCount > 0 ? 'summary-card--warn' : ''}">
        <div class="summary-value">${lowCount}</div>
        <div class="summary-label">库存偏低</div>
      </div>
    </div>`;

  html += `<div class="category-tabs">`;
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
      html += `<div class="section-title">${catInfo.icon} ${catInfo.label}</div><div class="item-list">`;
      grouped[cat]
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        .forEach((item, idx) => {
          const low = item.minStock > 0 && item.quantity <= item.minStock;
          html += `
            <div class="item-card ${low ? 'low-stock' : ''}" data-id="${item.id}" style="animation-delay:${idx * 40}ms">
              <div class="item-icon" style="background:${catInfo.color}18">${catInfo.icon}</div>
              <div class="item-info">
                <div class="item-name">${esc(item.name)}</div>
                <div class="item-meta">
                  ${item.sources.map(esc).join('、')}
                  ${low ? '<span class="badge badge-warning">库存偏低</span>' : ''}
                </div>
              </div>
              <div class="item-qty">
                <div class="qty-number">${item.quantity}</div>
                <div class="qty-unit">${esc(item.unit)}</div>
              </div>
            </div>`;
        });
      html += `</div>`;
    });
  }

  const depleted = loadItems().filter((i) => i.quantity <= 0);
  if (depleted.length > 0) {
    html += `<div class="section-title section-title--muted">已耗尽 (${depleted.length})</div><div class="item-list item-list--depleted">`;
    depleted
      .sort((a, b) => (b.depletedAt || '').localeCompare(a.depletedAt || ''))
      .forEach((item, idx) => {
        const catInfo = CATEGORIES[item.category];
        html += `
          <div class="item-card item-card--depleted" data-id="${item.id}" style="animation-delay:${idx * 40}ms">
            <div class="item-icon" style="background:${catInfo.color}18">${catInfo.icon}</div>
            <div class="item-info">
              <div class="item-name">${esc(item.name)}</div>
              <div class="item-meta">${item.depletedAt ? `耗尽于 ${item.depletedAt}` : '已耗尽'}</div>
            </div>
            <div class="item-qty">
              <div class="qty-number">0</div>
              <div class="qty-unit">${esc(item.unit)}</div>
            </div>
          </div>`;
      });
    html += `</div>`;
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
      const isAdjust = h.type === 'adjust';
      const icon = isPurchase ? '🛒' : isAdjust ? '✏️' : '📤';
      const label = isPurchase
        ? `购买 ${h.amount} ${item.unit}`
        : isAdjust
          ? `调整 ${h.previousAmount} → ${h.amount} ${item.unit}`
          : `消耗 ${h.amount} ${item.unit}`;
      return `
        <div class="history-item">
          <div class="history-type ${h.type}">${icon}</div>
          <div class="history-info">
            <div class="history-name">${label}</div>
            <div class="history-detail">${esc(h.source || h.note || '')}</div>
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
        <div class="item-meta">${item.sources.map(esc).join('、')}</div>
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
    ${historyHtml ? `<div class="history-list">${historyHtml}</div>` : '<p style="color:var(--text-secondary);font-size:0.85rem">暂无记录</p>'}
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
      const result = deleteItem(id);
      if (result && result.error) {
        showToast(result.error);
        return;
      }
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
    const result = updateItem(id, {
      name: fd.get('name').trim(),
      quantity: parseFloat(fd.get('quantity')),
      minStock: parseFloat(fd.get('minStock')) || 0,
    });
    if (result && result.error) {
      showToast(result.error);
      return;
    }
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

      const result = addPurchase({
        name: fd.get('name').trim(),
        category: cat.dataset.cat,
        quantity: parseFloat(fd.get('quantity')),
        unit: fd.get('unit'),
        source: source.dataset.source,
        date: fd.get('date'),
        minStock: parseFloat(fd.get('minStock')) || 0,
        note: fd.get('note').trim(),
      });

      if (result && result.error) {
        showToast(result.error);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      e.target.reset();
      const dateInput = e.target.querySelector('[name="date"]');
      if (dateInput) dateInput.value = today;
      document.querySelectorAll('#cat-chips .chip').forEach((c, i) => {
        c.classList.toggle('selected', i === 0);
      });
      document.querySelectorAll('#source-chips .chip').forEach((c, i) => {
        c.classList.toggle('selected', i === 0);
      });
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
      showToast(result.quantity <= 0 ? '已记录消耗，该物品已耗尽' : '已记录消耗');
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
        <div class="item-icon" style="background:${cat.color}14;width:40px;height:40px;font-size:1.1rem">${cat.icon}</div>
        <div class="stat-cat-info">
          <div class="stat-cat-name">${cat.label}</div>
          <div class="stat-cat-meta">${data.count} 种 · 共 ${data.totalQty} 件</div>
          <div class="stat-cat-bar">
            <div class="stat-cat-fill" style="width:${pct}%;background:linear-gradient(90deg,${cat.color},${cat.color}88)"></div>
          </div>
        </div>
      </div>`;
  });

  html += `<div class="section-title">最近动态</div>`;

  if (recentHistory.length === 0) {
    html += `<div class="empty-state" style="padding:24px"><p>暂无记录</p></div>`;
  } else {
    html += `<div class="history-list">`;
    recentHistory.forEach((h, idx) => {
      const isPurchase = h.type === 'purchase';
      const cat = CATEGORIES[h.category];
      html += `
        <div class="history-item" style="animation-delay:${idx * 35}ms">
          <div class="history-type ${h.type}">${isPurchase ? '🛒' : '📤'}</div>
          <div class="history-info">
            <div class="history-name">${esc(h.itemName)} ${isPurchase ? '+' : '-'}${h.amount} ${h.unit}</div>
            <div class="history-detail">${cat.icon} ${cat.label}${h.source ? ' · ' + h.source : ''}${h.note ? ' · ' + esc(h.note) : ''}</div>
          </div>
          <div class="history-date">${h.date}</div>
        </div>`;
    });
    html += `</div>`;
  }

  html += `
    <div class="section-title">数据备份</div>
    <div class="backup-card">
      <p class="backup-hint">导出 JSON 备份，换机或清缓存后可恢复数据</p>
      <div class="backup-actions">
        <button type="button" class="btn btn-secondary" id="btn-export">导出备份</button>
        <button type="button" class="btn btn-secondary" id="btn-import">导入备份</button>
        <input type="file" id="import-file" accept=".json,application/json" class="hidden" />
      </div>
    </div>`;

  $('#main-content').innerHTML = html;

  $('#btn-export')?.addEventListener('click', () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shopping-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出备份');
  });

  $('#btn-import')?.addEventListener('click', () => $('#import-file')?.click());

  $('#import-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const count = loadItems().length;
      if (!confirm(`导入将覆盖当前 ${count} 条记录，确定继续？`)) return;

      const result = importData(reader.result);
      if (result.error) {
        showToast(result.error);
        return;
      }
      render();
      showToast(`已导入 ${result.count} 条记录`);
    };
    reader.readAsText(file);
  });
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

updateHeaderDate();
navigate('inventory');
