const STORAGE_KEY = 'shopping-tracker-items';
const DATA_VERSION = 1;

const CATEGORIES = {
  clothes: { id: 'clothes', label: '衣服', icon: '👕', color: '#8b5cf6' },
  food: { id: 'food', label: '食品', icon: '🍎', color: '#f59e0b' },
  daily: { id: 'daily', label: '日用品', icon: '🧴', color: '#06b6d4' },
};

const SOURCES = ['淘宝', '京东', '拼多多', '盒马', '美团', '抖音', '线下', '其他'];

const UNITS = ['件', '个', '包', '瓶', '盒', '袋', '斤', '克', '升', '卷', '套'];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isValidPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isValidNonNegativeNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeItem(item) {
  const normalized = { ...item };
  if (normalized.quantity <= 0) {
    normalized.quantity = 0;
    if (!normalized.depletedAt) {
      const lastHistory = normalized.history?.[normalized.history.length - 1];
      normalized.depletedAt = lastHistory?.date || todayISO();
    }
  } else if (normalized.depletedAt) {
    delete normalized.depletedAt;
  }
  return normalized;
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return [];
    return items.map(normalizeItem);
  } catch {
    return [];
  }
}

function saveItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return { ok: true };
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      return { error: '存储空间不足，请导出备份后清理数据' };
    }
    return { error: '保存失败，请重试' };
  }
}

function getItem(id) {
  return loadItems().find((i) => i.id === id);
}

function addPurchase(data) {
  const name = (data.name || '').trim();
  if (!name) return { error: '请输入物品名称' };
  if (!CATEGORIES[data.category]) return { error: '请选择有效分类' };
  if (!isValidPositiveNumber(data.quantity)) return { error: '购买数量必须大于 0' };
  if (!data.unit) return { error: '请选择单位' };

  const items = loadItems();
  const existing = items.find(
    (i) => i.name === name && i.category === data.category && i.unit === data.unit
  );

  if (existing) {
    existing.quantity += data.quantity;
    delete existing.depletedAt;
    existing.history.push({
      type: 'purchase',
      amount: data.quantity,
      date: data.date,
      source: data.source,
      note: data.note || '',
    });
    if (data.source && !existing.sources.includes(data.source)) {
      existing.sources.push(data.source);
    }
    const saveResult = saveItems(items);
    if (saveResult.error) return saveResult;
    return existing;
  }

  const item = {
    id: generateId(),
    name,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit,
    sources: data.source ? [data.source] : [],
    minStock: isValidNonNegativeNumber(data.minStock) ? data.minStock : 0,
    createdAt: data.date,
    history: [
      {
        type: 'purchase',
        amount: data.quantity,
        date: data.date,
        source: data.source,
        note: data.note || '',
      },
    ],
  };
  items.push(item);
  const saveResult = saveItems(items);
  if (saveResult.error) return saveResult;
  return item;
}

function consumeItem(id, amount, note) {
  if (!isValidPositiveNumber(amount)) return { error: '消耗数量必须大于 0' };

  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return { error: '物品不存在' };
  if (amount > item.quantity) return { error: '消耗量不能超过当前存量' };

  item.quantity -= amount;
  item.history.push({
    type: 'consume',
    amount,
    date: todayISO(),
    note: note || '',
  });

  if (item.quantity <= 0) {
    item.quantity = 0;
    item.depletedAt = todayISO();
  }

  const saveResult = saveItems(items);
  if (saveResult.error) return saveResult;
  return item;
}

function updateItem(id, updates) {
  const items = loadItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { error: '物品不存在' };

  const current = items[idx];
  const next = { ...current };

  if (updates.name !== undefined) {
    const name = (updates.name || '').trim();
    if (!name) return { error: '名称不能为空' };
    next.name = name;
  }

  if (updates.quantity !== undefined) {
    if (!isValidNonNegativeNumber(updates.quantity)) {
      return { error: '存量必须为非负数' };
    }
    if (updates.quantity !== current.quantity) {
      next.history = [
        ...current.history,
        {
          type: 'adjust',
          amount: updates.quantity,
          previousAmount: current.quantity,
          date: todayISO(),
          note: '手动调整',
        },
      ];
    }
    next.quantity = updates.quantity;
    if (updates.quantity <= 0) {
      next.quantity = 0;
      next.depletedAt = todayISO();
    } else {
      delete next.depletedAt;
    }
  }

  if (updates.minStock !== undefined) {
    if (!isValidNonNegativeNumber(updates.minStock)) {
      return { error: '预警阈值必须为非负数' };
    }
    next.minStock = updates.minStock;
  }

  items[idx] = next;
  const saveResult = saveItems(items);
  if (saveResult.error) return saveResult;
  return next;
}

function deleteItem(id) {
  const items = loadItems().filter((i) => i.id !== id);
  return saveItems(items);
}

function isValidImportedItem(item) {
  return (
    item &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    CATEGORIES[item.category] &&
    typeof item.quantity === 'number' &&
    Number.isFinite(item.quantity) &&
    typeof item.unit === 'string' &&
    Array.isArray(item.history)
  );
}

function exportData() {
  return JSON.stringify(
    {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      items: loadItems(),
    },
    null,
    2
  );
}

function importData(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { error: '无法解析备份文件' };
  }

  const rawItems = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(rawItems)) return { error: '无效的数据格式' };

  const items = rawItems.filter(isValidImportedItem).map(normalizeItem);
  if (items.length === 0) return { error: '备份中没有有效记录' };

  const saveResult = saveItems(items);
  if (saveResult.error) return saveResult;
  return { ok: true, count: items.length };
}

function getStats() {
  const items = loadItems();
  const byCategory = {};
  let totalItems = 0;
  let lowStock = 0;

  Object.keys(CATEGORIES).forEach((cat) => {
    const catItems = items.filter((i) => i.category === cat && i.quantity > 0);
    byCategory[cat] = {
      count: catItems.length,
      totalQty: catItems.reduce((s, i) => s + i.quantity, 0),
    };
    totalItems += catItems.length;
  });

  items.forEach((i) => {
    if (i.quantity > 0 && i.minStock > 0 && i.quantity <= i.minStock) lowStock++;
  });

  const recentHistory = items
    .flatMap((i) =>
      i.history.map((h) => ({
        ...h,
        itemName: i.name,
        itemId: i.id,
        category: i.category,
        unit: i.unit,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  return { byCategory, totalItems, lowStock, recentHistory, allItems: items };
}
