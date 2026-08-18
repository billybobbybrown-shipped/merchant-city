-- A gas station's pump price: set by the owner, null until they open the
-- pumps. Fuel stock is just the property's 'fuel' inventory.
alter table lots add column if not exists pump_price numeric(8,2);
