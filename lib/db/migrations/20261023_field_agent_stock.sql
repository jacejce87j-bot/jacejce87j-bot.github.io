CREATE TABLE IF NOT EXISTS field_agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_agent_stock (
  field_agent_id INTEGER NOT NULL REFERENCES field_agents(id) ON DELETE RESTRICT,
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (field_agent_id, stock_item_id)
);
CREATE INDEX IF NOT EXISTS field_agent_stock_stock_item_id_idx ON field_agent_stock(stock_item_id);

ALTER TABLE ticket_stock_usage
  ADD COLUMN IF NOT EXISTS field_agent_id INTEGER REFERENCES field_agents(id) ON DELETE RESTRICT;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS field_agent_id INTEGER REFERENCES field_agents(id) ON DELETE RESTRICT;

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'opening_balance',
    'adjustment',
    'ticket_usage',
    'ticket_usage_reversal',
    'transfer_to_field_agent',
    'received_by_field_agent',
    'field_agent_ticket_usage',
    'field_agent_ticket_usage_reversal'
  ));
