# Mock Business Stock Database

This folder contains a standalone SQLite database for future AI context experiments.
It is not called by the Worker or Electron shell yet.

- `business-stock.seed.sql` defines and seeds the mock inventory database.
- `business-stock.sqlite` is generated from the seed file.

The mock data represents a retail/POS equipment business with products, locations,
stock levels, suppliers, purchase orders, and stock movement history.

Example future use case:

If a customer asks to buy 20 units of an item with only 10 available, the AI can use
this database as context and warn the sales representative that stock is low.
