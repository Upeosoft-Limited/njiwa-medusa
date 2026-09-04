# Njiwa for Medusa

WhatsApp your customers when their order is placed, paid, packed, shipped,
cancelled or refunded, and get a message yourself when an order comes in.

**This is a Medusa 2 plugin.** Medusa 2 changed how plugins are built, loaded
and configured, and nothing here works on Medusa 1.x. It is tested against
Medusa 2.20 and needs Node 20.19 or newer.

## Install

```bash
npm install github:Upeosoft-Limited/njiwa-medusa
```

It is not on the npm registry. The name `njiwa-medusa` there belongs to nobody,
so asking npm for it by name would either fail or, one day, install a stranger's
package into your Medusa server. Install it from the repository instead, which
is public and needs no token.

npm builds it for you on the way in - the `prepare` script runs `medusa
plugin:build`, which is what puts the files the plugin actually loads under
`.medusa/server`.

Then add it to `medusa-config.ts` and restart Medusa:

```ts
module.exports = defineConfig({
  projectConfig: {
    // your existing project config
  },
  plugins: [
    {
      resolve: "njiwa-medusa",
      options: {
        apiKey: process.env.NJIWA_API_KEY,
      },
    },
  ],
})
```

That is all the config needs. Which events are on, what each message says, your
own numbers and everything else are set on the **Njiwa WhatsApp** page in the
Medusa admin, and nothing is sent until you turn an event on there.

Every option on that page can also be given here as a starting point, which is
worth doing if you keep several shops in step from one repository. The table
further down lists them.

The plugin registers its own module, so there is nothing to add to `modules`,
and there is no migration to run: what you save on the settings page is kept in
your Medusa store's own metadata, and the plugin owns no tables.

## Set it up

Get an API key from [console.upeo.ai](https://console.upeo.ai) → API keys, put
it in `NJIWA_API_KEY`, restart Medusa, and open **Njiwa WhatsApp** in the
admin sidebar. Everything below is on that page.

**Start with a test key.** A key beginning `sk_test_` checks and stores every
message and delivers nothing. Turn on the events you want, place a test order,
watch the log and the order's metadata, and only then swap in the `sk_live_`
key. A `sk_live_` key sends real WhatsApp messages, and those cost money. The
page tells you which kind of key it is looking at.

### The two buttons

**Test connection** lists the WhatsApp numbers your Njiwa account actually has,
with their state and which one is default, so you find out now rather than at
the moment a customer should have been messaged. It sends no message to
anybody.

**Send test message** sends one fixed message to the number you type next to
it, or to the first of your own numbers if you leave it empty. The wording is
fixed in the code: you supply the recipient and nothing else. It will not send
to a WhatsApp group, and it is limited to five messages in five minutes.

Both buttons use the settings **as they are saved**, not as they are on screen.
Save first, then check.

Both are ordinary admin routes, so you can also use them from a terminal, with
a secret admin API key over HTTP Basic:

```bash
curl -u sk_your_medusa_admin_key: \
  http://localhost:9000/admin/njiwa/test-connection

curl -u sk_your_medusa_admin_key: \
  -H 'Content-Type: application/json' \
  -d '{"to": "254712345678"}' \
  http://localhost:9000/admin/njiwa/test-message
```

## What you change where

The settings page in the admin is where the day to day settings live: the
master switch, which events are on, what each message says, the number you send
from, your own numbers, your shop name and the two addresses. Changing one
takes effect on the next order. There is nothing to restart and nothing to
deploy.

Two settings stay in `medusa-config.ts` and are shown on the page but not
editable there:

| Setting | Why it is not on the page |
| --- | --- |
| `apiKey` | It is a secret. Medusa gives a plugin nowhere encrypted to keep one, and the store metadata the other settings live in is plain text that anyone with a dashboard login can read back. Keep it in an environment variable, and rotate it by changing that variable and restarting. |
| `baseUrl` | It decides where your API key is sent. Somebody who could change it in the admin could collect the key. Almost no shop should ever set it. |

The plugin options are the starting point for everything else: they are what
the plugin uses until somebody saves the page, and what it falls back to for
any setting the page has never saved. Once you save, the page is what the
plugin reads.

## The options

| Option | What it is for |
| --- | --- |
| `enabled` | The master switch. `false` keeps every other option and sends nothing. Defaults to `true`. |
| `apiKey` | Your Njiwa key. `sk_test_` delivers nothing, `sk_live_` sends for real. |
| `baseUrl` | The Njiwa address. Leave it out unless you were given your own; the default is `https://njiwa.upeo.ai`. |
| `sendFrom` | Which of your linked WhatsApp numbers sends, in full international form. Leave it out to use the number marked default in the console, which is the right answer if you have one number. |
| `shopName` | Your shop name, for `{shop_name}`. Leave it out and the name of your Medusa store is used. |
| `locale` | How money and dates are written in messages, such as `en-KE` or `de-DE`. Defaults to `en-US`. |
| `adminNumbers` | Where the new-order alert goes. One string, comma separated, or an array. Everybody listed gets their own copy. |
| `storefrontOrderUrl` | Your storefront's order page with `{order_id}` where the id goes, so `{order_url}` has something to be, for example `https://shop.example.com/order/{order_id}/confirmed`. Left out, `{order_url}` is empty. |
| `adminUrl` | Where your Medusa admin can be reached from a phone, for `{admin_url}`. Left out, the `admin.backendUrl` already in your `medusa-config.ts` is used. |
| `events` | One entry per event: `{ enabled, template }`. Both are optional. |

Every option except `apiKey` and `baseUrl` can be changed on the settings page
afterwards, and the saved value wins.

Every event is **off until you turn it on**. Installing this plugin cannot
cause a message to be sent.

Every event **ships wording that works unedited**, so turning one on is one
switch, not one switch and a writing exercise. Change the wording only when you
want to say it differently. Empty wording is how you turn one message off
without turning the event off.

## What gets sent, and when

| Event option | The Medusa event behind it | Who hears about it |
| --- | --- | --- |
| `order_placed` | `order.placed` | The customer: we have your order |
| `payment_captured` | `payment.captured` | The customer: your payment went through |
| `fulfillment_created` | `order.fulfillment_created` | The customer: it is packed |
| `shipment_created` | `shipment.created` | The customer: it is on its way |
| `order_canceled` | `order.canceled` | The customer: cancelled, and you were not charged |
| `refund_created` | `payment.refunded` | The customer: the money is coming back |
| `new_order_alert` | `order.placed` | You: a new order came in |

The alert to you goes out on `order.placed`, which is the first moment an order
is real. Not when a cart is created, which happens the moment somebody reaches
the payment page and usually means nothing.

`fulfillment_created` and `shipment_created` are two different moments:
fulfilling is packing the items, creating a shipment is handing them over. A
shop that turns on both is telling the customer twice, on purpose. Most shops
want one of them.

Fulfilling or shipping with **"do not notify the customer"** ticked sends
nothing, because that is what it means.

## The wording

Plain text with placeholders in braces:

| Placeholder | What it becomes |
| --- | --- |
| `{first_name}` | The first name on the order, or "there" if the order has none. |
| `{last_name}` | The last name on the order. |
| `{customer_name}` | Both names together. |
| `{order_number}` | The order number as the customer sees it, such as #1042. |
| `{order_total}` | The total, with your currency. |
| `{order_date}` | The date the order was placed. |
| `{order_status}` | The order status at the moment the message is sent. |
| `{payment_method}` | How they paid, as the payment provider on the order. |
| `{items}` | One line per item, as "2 x Blue shirt". |
| `{item_count}` | How many items in total. |
| `{shop_name}` | Your shop name. |
| `{order_url}` | A link to their own order. Empty unless you set `storefrontOrderUrl`. |
| `{admin_url}` | A link that opens the order in your Medusa admin. Only put this in the message to yourself. |

A placeholder that does not exist, `{order_no}` say, is removed before sending
rather than posted to a customer, and a line is written to the Medusa log
telling you where to look.

Names come from the shipping address, or the billing address if there is no
shipping address, which is also where the customer's phone number is read from.

## Things worth knowing

**The storefront never waits.** Medusa 2 runs subscribers on the event bus,
after the request that caused them has been answered. A slow network, or Njiwa
being down, cannot delay a checkout or lose a sale. Nothing this plugin does is
allowed to throw, either: a failure is logged and the order carries on.

**Every send is written on the order.** Look at any order's metadata and you
will find a `njiwa` entry saying what went where, with Njiwa's message id, or
why it did not go. Medusa 2 has no order notes, so this is the record.

**Your settings live on your store.** What you save on the page is kept in the
`njiwa` key of your Medusa store's metadata. There is no table and no
migration, the settings are read fresh on every order so a change takes effect
immediately, and if that row cannot be read for any reason the plugin falls
back to your `medusa-config.ts` options rather than stopping.

**Nothing is sent twice.** Each message carries an idempotency key made from
your store, the order, the event and the recipient. If a subscriber runs
twice, Njiwa replays the first answer instead of messaging the customer again,
for 24 hours. The marker on the order covers everything after that. A message
that failed is not marked as sent, so the same event arriving again is free to
try again.

**Phone numbers are read against the order's country.** `0712345678` on an
order shipping to Kenya becomes `254712345678`. A number already written in
full is left alone. Where the country is missing, the number is passed on as
typed and Njiwa resolves it against your own sending number's country.

**A customer with no phone number is not an error.** Nothing is sent, and
nothing is complained about.

**A WhatsApp group is never messaged.** An address ending `@g.us` is a group,
and one new order posted to a group would message hundreds of people from your
own number. Anything with an `@` in it is dropped rather than cleaned up,
wherever a number is accepted.

**Turning the master switch off fails loudly.** With **Send WhatsApp messages**
off, or `enabled: false` in the config, nothing is sent, and anything that tries
to send anyway writes a line saying why. Silence that looks exactly like a
working shop is worse than an error in a log.

## What it does not do

**It does not receive replies.** Inbound WhatsApp arrives as a webhook, and
verifying one needs that number's signing secret, which the console does not
yet show. Until it does, a receiving feature could not check that a request
really came from Njiwa, so there is not one.

**It does not run campaigns.** Bulk sending to past customers is what the Njiwa
console is for, on Business plans and above.

**It does not keep its own copy of your messages.** Njiwa already stores every
message, its status and its failure reason. A second copy is a second thing to
keep in step.

## Development

```bash
npm install
npm test          # the template renderer and the number parser
npm run build     # medusa plugin:build
```

The renderer and the parser are plain TypeScript with no Medusa in them, so the
tests run in a second without a database, a Redis or an event bus anywhere near
them.

`src/admin/routes/njiwa/page.tsx` is the settings page. `medusa plugin:build`
bundles it ahead of time into `.medusa/server/src/admin`, which is what the
`./admin` export in `package.json` points at, and the Medusa dashboard of any
project that installs this plugin picks it up from there.

---

Docs: https://docs.njiwa.upeo.ai · Console: https://console.upeo.ai
UPEO.AI · hello@upeo.ai · 0116888777 on WhatsApp
