const STORAGE_KEY = 'shopping-tracker-items';

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

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getItem(id) {
  return loadItems().find((i) => i.id === id);
}

function addPurchase(data) {
  const items = loadItems();
  const existing = items.find(
    (i) => i.name === data.name && i.category === data.category && i.unit === data.unit
  );

  if (existing) {
    existing.quantity += data.quantity;
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
    saveItems(items);
    return existing;
  }

  const item = {
    id: generateId(),
    name: data.name,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit,
    sources: [data.source],
    minStock: data.minStock || 0,
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
  saveItems(items);
  return item;
}

function consumeItem(id, amount, note) {
  const items = loadItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  if (amount > item.quantity) return { error: '消耗量不能超过当前存量' };

  item.quantity -= amount;
  item.history.push({
    type: 'consume',
    amount,
    date: new Date().toISOString().slice(0, 10),
    note: note || '',
  });
  saveItems(items);
  return item;
}

function updateItem(id, updates) {
  const items = loadItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  saveItems(items);
  return items[idx];
}

function deleteItem(id) {
  const items = loadItems().filter((i) => i.id !== id);
  saveItems(items);
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
    if (i.minStock > 0 && i.quantity <= i.minStock) lowStock++;
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
