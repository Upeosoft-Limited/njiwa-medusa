/** The message itself. */

import {
  defaultTemplate,
  EVENT_KEYS,
  MAX_ITEMS,
  MAX_LENGTH,
  render,
  type OrderView,
} from "../src/modules/njiwa/templates"

function view(overrides: Partial<OrderView> = {}): OrderView {
  return {
    firstName: "Amina",
    lastName: "Otieno",
    customerName: "Amina Otieno",
    orderNumber: "#1042",
    orderTotal: "KES 2,500.00",
    orderDate: "4 Sep 2026",
    orderStatus: "Pending",
    paymentMethod: "Stripe",
    items: [
      { title: "Blue shirt (M)", quantity: 2 },
      { title: "Socks", quantity: 1 },
    ],
    itemCount: 3,
    shopName: "Duka",
    orderUrl: "https://shop.example.com/order/order_01",
    adminUrl: "https://admin.example.com/app/orders/order_01",
    ...overrides,
  }
}

describe("render", () => {
  it("fills in every placeholder there is", () => {
    const message = render(
      "{first_name} {last_name} {customer_name} {order_number} {order_total} {order_date} " +
        "{order_status} {payment_method} {item_count} {shop_name} {order_url} {admin_url}",
      view()
    )

    expect(message).toBe(
      "Amina Otieno Amina Otieno #1042 KES 2,500.00 4 Sep 2026 " +
        "Pending Stripe 3 Duka https://shop.example.com/order/order_01 " +
        "https://admin.example.com/app/orders/order_01"
    )
  })

  it("writes one line per item", () => {
    expect(render("{items}", view())).toBe("2 x Blue shirt (M)\n1 x Socks")
  })

  it("starts counting once there are too many items to list", () => {
    const items = Array.from({ length: MAX_ITEMS + 3 }, (_, index) => ({
      title: `Item ${index + 1}`,
      quantity: 1,
    }))

    const lines = render("{items}", view({ items })).split("\n")

    expect(lines).toHaveLength(MAX_ITEMS + 1)
    expect(lines[MAX_ITEMS]).toBe("and 3 more items")
  })

  it("says 'item' when only one is left over", () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => ({
      title: `Item ${index + 1}`,
      quantity: 1,
    }))

    expect(render("{items}", view({ items })).split("\n").pop()).toBe("and 1 more item")
  })

  it("calls an order with no name on it 'there'", () => {
    expect(render("Hi {first_name}", view({ firstName: "" }))).toBe("Hi there")
    expect(render("Hi {first_name}", view({ firstName: "   " }))).toBe("Hi there")
  })

  it("removes a placeholder that does not exist, and says which", () => {
    const unknown: string[][] = []
    const message = render("Order {order_no} for {first_name}", view(), (found) =>
      unknown.push(found)
    )

    expect(message).toBe("Order  for Amina")
    expect(unknown).toEqual([["{order_no}"]])
  })

  it("does not eat braces that came from the order itself", () => {
    const message = render("{items}", view({ items: [{ title: "{sale} mug", quantity: 1 }] }))

    expect(message).toBe("1 x {sale} mug")
  })

  it("sends nothing when the wording has been cleared", () => {
    expect(render("", view())).toBe("")
    expect(render("   \n  ", view())).toBe("")
  })

  it("closes up the gap a blank placeholder leaves behind", () => {
    expect(render("One\n\n{admin_url}\n\nTwo", view({ adminUrl: "" }))).toBe("One\n\nTwo")
  })

  it("stops short of what WhatsApp will take", () => {
    const message = render("x".repeat(MAX_LENGTH + 500), view())

    expect([...message]).toHaveLength(MAX_LENGTH)
    expect(message.endsWith("…")).toBe(true)
  })
})

describe("the wording every event ships with", () => {
  it.each(EVENT_KEYS)("%s reads as a message without being edited", (event) => {
    const message = render(defaultTemplate(event), view())

    expect(message).not.toBe("")
    expect(message).not.toMatch(/\{[a-z_]+\}/)
    expect(message).toContain("Duka")
  })

  it("only puts the dashboard link in the message to the shop owner", () => {
    for (const event of EVENT_KEYS) {
      const usesAdminUrl = defaultTemplate(event).includes("{admin_url}")
      expect(usesAdminUrl).toBe(event === "new_order_alert")
    }
  })
})
