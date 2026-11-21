'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function orderFor(item, coupon) {
  return {
    id: 1,
    date: '21/11/2026',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: coupon || '',
    items: [item]
  };
}

function rice(price, qty) {
  return {
    id: 1,
    name: 'Test rice',
    sku: 'RICE-TEST',
    hsn: '1006',
    price: price,
    qty: qty
  };
}

test('Invoice totals and per-line GST breakdown match the billed pricing calculation', function () {
  const order = orderFor(rice(100, 1), 'WELCOME');
  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: printed.subtotal, discount: printed.discount, tax: printed.tax, cgst: printed.cgst, sgst: printed.sgst, total: printed.total },
    { subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, cgst: billed.cgst, sgst: billed.sgst, total: billed.total }
  );
  assert.deepEqual(
    printed.rows.map(function (row) { return { gstPercent: row.gstPercent, line: row.line, lineTax: row.lineTax }; }),
    billed.lines.map(function (line) { return { gstPercent: line.gstPercent, line: line.gross, lineTax: line.tax }; })
  );
});

test('Invoice uses the HSN rate and subtotal coupon before tax, matching billed pricing', function () {
  const order = orderFor(rice(100, 1), 'WELCOME');
  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, total: billed.total },
    { subtotal: 100, discount: 5, tax: 4.75, total: 99.75 }
  );
  assert.deepEqual(
    { subtotal: printed.subtotal, discount: printed.discount, tax: printed.tax, cgst: printed.cgst, sgst: printed.sgst, total: printed.total },
    { subtotal: 100, discount: 5, tax: 4.75, cgst: 2.38, sgst: 2.37, total: 99.75 }
  );
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.rows[0].lineTax, 4.75);
});

test('Invoice respects the SAVE10 maximum discount and matches billed GST', function () {
  const order = orderFor(rice(1000, 5), 'SAVE10');
  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 150, tax: 242.5, total: 5092.5 }
  );
  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: 150, tax: 242.5, total: 5092.5 }
  );
});

test('Invoice excludes the inactive DIWALI20 coupon, matching billed pricing', function () {
  const order = orderFor(rice(1000, 1), 'DIWALI20');
  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 0, tax: 50, total: 1050 }
  );
  assert.deepEqual(
    { discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: 0, tax: 50, total: 1050 }
  );
});

test('GST reconciliation reports no invoice-to-ledger difference when calculations align', function () {
  const order = orderFor(rice(100, 1), 'WELCOME');
  const billed = pricing.computeTotals(order.items, order.coupon);
  order.subtotal = billed.subtotal;
  order.discount = billed.discount;
  order.tax = billed.tax;
  order.total = billed.total;

  const result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].invoiceTotal, 99.75);
  assert.equal(result.rows[0].ledgerTotal, 99.75);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});
