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
    'return_from_field_agent',
    'received_by_orion_stock',
    'field_agent_ticket_usage',
    'field_agent_ticket_usage_reversal'
  ));
