WITH initial_stock (sku, name, quantity_on_hand) AS (
  VALUES
    ('OTLITE', 'Orion Lite 920', 19),
    ('M20', 'Dashcam', 5),
    ('M32', 'MDVR', 24),
    ('M52', 'MDVR', 1),
    ('G40PRO', 'Hikvision G40 Pro', 1),
    ('TSSD256', 'Transcend SSD 256GB', 1),
    ('TSSD500', 'Transcend SSD 500GB', 1),
    ('TMSD256', 'Transcend Micro SD 256GB', 10),
    ('BOXCAM', 'Box Camera 1080p', 29),
    ('SIDECAM', 'Side Camera 1080p', 37),
    ('DUALV', 'DualView Road Camera 1080p', 20),
    ('DOMECAM(A)', 'Dome Camera with Audio 1080p', 42),
    ('5MTR', '5MTR Harness', 36),
    ('10MTR', '10MTR Harness', 26),
    ('AE-MC', 'AE-MC Converter', 53),
    ('SCRN', '10-inch IPS Screen', 22),
    ('PANIC', 'Panic Button', 12)
),
inserted_items AS (
  INSERT INTO stock_items (sku, name, unit, quantity_on_hand)
  SELECT sku, name, 'units', quantity_on_hand
  FROM initial_stock
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, quantity_on_hand
)
INSERT INTO stock_movements (stock_item_id, movement_type, quantity_delta, reason)
SELECT id, 'opening_balance', quantity_on_hand, 'Initial stock on hand'
FROM inserted_items
WHERE quantity_on_hand > 0;
