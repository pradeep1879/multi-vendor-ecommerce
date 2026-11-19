import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type InvoiceOrder = {
  orderNumber: string;
  createdAt: Date;
  currency: string;
  itemSubtotalPaise: bigint;
  discountPaise: bigint;
  taxPaise: bigint;
  shippingPaise: bigint;
  payablePaise: bigint;
  shippingAddress: unknown;
  items: Array<{
    productNameSnapshot: string;
    skuSnapshot: string;
    vendorNameSnapshot: string;
    quantity: number;
    unitPricePaise: bigint;
    lineSubtotalPaise: bigint;
    discountPaise: bigint;
    taxPaise: bigint;
  }>;
  vendorOrders: Array<{
    vendor: { name: string };
    shippingPaise: bigint;
    taxPaise: bigint;
    items: Array<{ taxPaise: bigint }>;
  }>;
};

function safeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .slice(0, 160);
}
function money(value: bigint): string {
  const whole = value / 100n;
  const paise = (value % 100n).toString().padStart(2, '0');
  return `${whole}.${paise}`;
}

export async function createInvoicePdf(order: InvoiceOrder): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = 790;
  const write = (text: string, size = 10, strong = false) => {
    if (y < 58) {
      page = pdf.addPage(pageSize);
      y = 790;
    }
    page.drawText(safeText(text), {
      x: 44,
      y,
      size,
      font: strong ? bold : regular,
      color: rgb(0.12, 0.16, 0.22),
      maxWidth: 505,
    });
    y -= size + 8;
  };
  write('TAX INVOICE', 22, true);
  write(`Invoice: INV-${order.orderNumber}`, 11, true);
  write(
    `Order: ${order.orderNumber}    Date: ${order.createdAt.toISOString().slice(0, 10)}    Currency: ${order.currency}`,
  );
  y -= 8;
  write('Bill to', 12, true);
  if (typeof order.shippingAddress === 'object' && order.shippingAddress !== null) {
    const address = order.shippingAddress as Record<string, unknown>;
    for (const key of [
      'recipient',
      'line1',
      'line2',
      'city',
      'region',
      'postalCode',
      'countryCode',
    ]) {
      const value = address[key];
      if (typeof value === 'string' && value.trim()) write(value.trim());
    }
  }
  y -= 8;
  write('Items', 12, true);
  write('Product | Seller | SKU | Qty | Unit (INR) | Discount | Tax | Line total', 9, true);
  for (const item of order.items) {
    const total = item.lineSubtotalPaise - item.discountPaise + item.taxPaise;
    write(
      `${item.productNameSnapshot} | ${item.vendorNameSnapshot} | ${item.skuSnapshot} | ${item.quantity} | ${money(item.unitPricePaise)} | ${money(item.discountPaise)} | ${money(item.taxPaise)} | ${money(total)}`,
      8,
    );
  }
  for (const vendor of order.vendorOrders) {
    const itemTax = vendor.items.reduce((sum, item) => sum + item.taxPaise, 0n);
    const shippingTax = vendor.taxPaise - itemTax;
    write(
      `Shipping (${vendor.vendor.name}): INR ${money(vendor.shippingPaise)}; shipping tax: INR ${money(shippingTax)}`,
      9,
    );
  }
  y -= 8;
  write(`Item subtotal: INR ${money(order.itemSubtotalPaise)}`);
  write(`Discount: INR ${money(order.discountPaise)}`);
  write(`Tax: INR ${money(order.taxPaise)}`);
  write(`Shipping: INR ${money(order.shippingPaise)}`);
  write(`Total paid / payable: INR ${money(order.payablePaise)}`, 13, true);
  y -= 8;
  write('Values are based on the order snapshots recorded at checkout.', 9);
  return pdf.save();
}
