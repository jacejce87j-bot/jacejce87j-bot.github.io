CREATE TABLE IF NOT EXISTS stock_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  unit TEXT NOT NULL DEFAULT 'units',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_stock_usage (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  recorded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deducted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS ticket_stock_usage_ticket_id_idx ON ticket_stock_usage(ticket_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening_balance', 'adjustment', 'ticket_usage')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reason TEXT,
  recorded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_movements_stock_item_id_idx ON stock_movements(stock_item_id);
