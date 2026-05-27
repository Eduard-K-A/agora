PRAGMA foreign_keys = ON;

DROP VIEW IF EXISTS low_stock_items;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS inventory_stock;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS businesses;

CREATE TABLE businesses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL,
  contact_email TEXT NOT NULL
);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('warehouse', 'storefront', 'service_van')),
  city TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_price_cents INTEGER NOT NULL,
  reorder_point INTEGER NOT NULL,
  target_stock INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE inventory_stock (
  product_id INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  quantity_on_hand INTEGER NOT NULL,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  quantity_available INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, location_id)
);

CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'reservation', 'return', 'adjustment')),
  quantity_delta INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIEW low_stock_items AS
SELECT
  p.sku,
  p.name,
  p.category,
  l.name AS location_name,
  s.quantity_available,
  p.reorder_point,
  p.target_stock,
  CASE
    WHEN s.quantity_available <= 0 THEN 'out_of_stock'
    WHEN s.quantity_available < p.reorder_point THEN 'low_stock'
    ELSE 'healthy'
  END AS stock_status
FROM inventory_stock s
JOIN products p ON p.id = s.product_id
JOIN locations l ON l.id = s.location_id
WHERE p.is_active = 1;

INSERT INTO businesses (id, name, industry, currency_code, created_at) VALUES
  (1, 'Clicky Retail Supply', 'Retail POS equipment and consumables', 'USD', '2026-05-27T00:00:00Z');

INSERT INTO suppliers (id, business_id, name, lead_time_days, contact_email) VALUES
  (1, 1, 'Northstar Hardware Distribution', 7, 'orders@northstar.example'),
  (2, 1, 'PaperTrail Consumables', 3, 'stock@papertrail.example'),
  (3, 1, 'MetroPOS Devices', 14, 'partners@metropos.example');

INSERT INTO locations (id, business_id, name, location_type, city, is_active) VALUES
  (1, 1, 'Main Warehouse', 'warehouse', 'Austin', 1),
  (2, 1, 'Downtown Showroom', 'storefront', 'Austin', 1),
  (3, 1, 'Field Service Van 1', 'service_van', 'Austin', 1);

INSERT INTO products (
  id,
  business_id,
  supplier_id,
  sku,
  name,
  category,
  unit,
  unit_price_cents,
  reorder_point,
  target_stock,
  is_active
) VALUES
  (1, 1, 1, 'WBS-100', 'Wireless Barcode Scanner', 'Hardware', 'piece', 12900, 15, 60, 1),
  (2, 1, 1, 'TRP-200', 'Thermal Receipt Printer', 'Hardware', 'piece', 18900, 8, 35, 1),
  (3, 1, 3, 'NCR-10', 'NFC Card Reader', 'Payments', 'piece', 4900, 20, 80, 1),
  (4, 1, 3, 'TPS-12', 'Tablet POS Stand', 'Hardware', 'piece', 7500, 12, 50, 1),
  (5, 1, 1, 'CD-400', 'Cash Drawer', 'Hardware', 'piece', 9900, 10, 40, 1),
  (6, 1, 2, 'LR-57', '57mm Label Roll Pack', 'Consumables', 'pack', 1600, 60, 240, 1),
  (7, 1, 3, 'HPT-8', 'Handheld POS Terminal', 'Payments', 'piece', 24900, 10, 30, 1),
  (8, 1, 1, 'SM-01', 'Scanner Counter Mount', 'Accessories', 'piece', 2100, 12, 45, 1),
  (9, 1, 2, 'RP-80', '80mm Receipt Paper Case', 'Consumables', 'case', 3200, 80, 320, 1),
  (10, 1, 3, 'SSB-5', 'Small Store Starter Bundle', 'Bundles', 'bundle', 49900, 5, 20, 1);

INSERT INTO inventory_stock (
  product_id,
  location_id,
  quantity_on_hand,
  quantity_reserved,
  quantity_available,
  updated_at
) VALUES
  (1, 1, 12, 2, 10, '2026-05-27T09:00:00Z'),
  (1, 2, 3, 1, 2, '2026-05-27T09:00:00Z'),
  (2, 1, 5, 1, 4, '2026-05-27T09:00:00Z'),
  (2, 2, 2, 0, 2, '2026-05-27T09:00:00Z'),
  (3, 1, 30, 3, 27, '2026-05-27T09:00:00Z'),
  (3, 2, 8, 0, 8, '2026-05-27T09:00:00Z'),
  (4, 1, 9, 1, 8, '2026-05-27T09:00:00Z'),
  (4, 2, 2, 0, 2, '2026-05-27T09:00:00Z'),
  (5, 1, 14, 2, 12, '2026-05-27T09:00:00Z'),
  (6, 1, 240, 20, 220, '2026-05-27T09:00:00Z'),
  (6, 3, 12, 0, 12, '2026-05-27T09:00:00Z'),
  (7, 1, 7, 1, 6, '2026-05-27T09:00:00Z'),
  (8, 1, 4, 1, 3, '2026-05-27T09:00:00Z'),
  (9, 1, 510, 30, 480, '2026-05-27T09:00:00Z'),
  (9, 2, 24, 0, 24, '2026-05-27T09:00:00Z'),
  (10, 1, 6, 1, 5, '2026-05-27T09:00:00Z');

INSERT INTO purchase_orders (
  id,
  business_id,
  product_id,
  supplier_id,
  quantity_ordered,
  quantity_received,
  status,
  expected_at,
  created_at
) VALUES
  (1, 1, 1, 1, 50, 0, 'ordered', '2026-06-03T00:00:00Z', '2026-05-26T10:15:00Z'),
  (2, 1, 2, 1, 25, 0, 'ordered', '2026-06-04T00:00:00Z', '2026-05-26T10:20:00Z'),
  (3, 1, 7, 3, 20, 5, 'partially_received', '2026-06-10T00:00:00Z', '2026-05-20T13:30:00Z'),
  (4, 1, 8, 1, 40, 0, 'ordered', '2026-06-02T00:00:00Z', '2026-05-27T08:45:00Z');

INSERT INTO stock_movements (
  id,
  business_id,
  product_id,
  location_id,
  movement_type,
  quantity_delta,
  note,
  created_at
) VALUES
  (1, 1, 1, 1, 'sale', -20, 'Order SO-1042 for two-store rollout', '2026-05-24T15:20:00Z'),
  (2, 1, 1, 1, 'reservation', -2, 'Reserved for demo install', '2026-05-26T11:30:00Z'),
  (3, 1, 2, 1, 'sale', -8, 'Printer replacement batch', '2026-05-25T12:10:00Z'),
  (4, 1, 3, 1, 'return', 4, 'Customer exchange return inspected and restocked', '2026-05-26T14:05:00Z'),
  (5, 1, 7, 1, 'purchase', 5, 'Partial receipt from MetroPOS Devices', '2026-05-26T16:45:00Z'),
  (6, 1, 8, 1, 'adjustment', -1, 'Damaged mount removed from sellable stock', '2026-05-27T08:20:00Z'),
  (7, 1, 9, 1, 'sale', -60, 'Receipt paper case bulk order', '2026-05-23T09:35:00Z'),
  (8, 1, 10, 1, 'reservation', -1, 'Starter bundle held for showroom demo', '2026-05-27T09:10:00Z');
