/**
 * Settings, in the Medusa admin, where somebody setting a shop up is standing.
 *
 * Medusa 2 lets a plugin add pages to the dashboard: a default-exported React
 * component under src/admin/routes/<path>/page.tsx becomes a page, and the
 * exported config gives it its entry in the sidebar. `medusa plugin:build`
 * bundles this directory ahead of time, which is why package.json carries an
 * "./admin" export for the bundle it produces.
 *
 * The page keeps no copy of the event list, the default wording or the
 * placeholder list. It renders what /admin/njiwa/settings hands it, so the
 * words on this screen and the behaviour on the server cannot drift apart.
 *
 * Paths are relative on purpose: the dashboard is served by the Medusa server
 * itself, so /admin/njiwa/settings is this plugin's own route and the admin
 * session cookie already on the request is what authenticates it.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Switch, Text, Textarea } from "@medusajs/ui"
import { useEffect, useState } from "react"

type EventKey = string

type EventInfo = {
  key: EventKey
  label: string
  help: string
  audience: "you" | "customer"
  default_template: string
}

type EditableSettings = {
  enabled: boolean
  sendFrom: string
  shopName: string
  locale: string
  adminNumbers: string
  storefrontOrderUrl: string
  adminUrl: string
  events: Record<EventKey, { enabled: boolean; template: string }>
}

type SettingsView = {
  settings: EditableSettings
  boot_only: {
    api_key_set: boolean
    test_key: boolean
    base_url: string
    why: string
  }
  events: EventInfo[]
  fallbacks: { shopName: string; adminUrl: string }
  placeholders: Record<string, string>
  max_length: number
  warnings?: string[]
}

type Note = { tone: "good" | "bad"; lines: string[] }

/**
 * Ask this plugin's own admin routes something.
 *
 * It never throws. A page whose Save button can be left spinning by a dropped
 * connection is a page somebody presses again, so a failure comes back as an
 * ordinary answer with something to read.
 */
async function call(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; body: any }> {
  let response: Response

  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    return {
      ok: false,
      body: { message: "Your Medusa server did not answer. Check that it is running and try again." },
    }
  }

  let body: any = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }

  return { ok: response.ok, body }
}

const NjiwaSettingsPage = () => {
  const [view, setView] = useState<SettingsView | undefined>()
  const [form, setForm] = useState<EditableSettings | undefined>()
  const [loadError, setLoadError] = useState("")
  const [busy, setBusy] = useState("")
  const [note, setNote] = useState<Note | undefined>()
  const [testNumber, setTestNumber] = useState("")

  useEffect(() => {
    let cancelled = false

    call("/admin/njiwa/settings").then(({ ok, body }) => {
      if (cancelled) {
        return
      }
      if (!ok) {
        setLoadError(body?.message ?? "The Njiwa settings could not be read.")
        return
      }
      setView(body)
      setForm(body.settings)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const change = (patch: Partial<EditableSettings>) => {
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  const changeEvent = (key: EventKey, patch: Partial<{ enabled: boolean; template: string }>) => {
    setForm((current) =>
      current
        ? { ...current, events: { ...current.events, [key]: { ...current.events[key], ...patch } } }
        : current
    )
  }

  const save = async () => {
    if (!form) {
      return
    }
    setBusy("save")
    setNote(undefined)

    const { ok, body } = await call("/admin/njiwa/settings", { method: "POST", body: form })
    setBusy("")

    if (!ok) {
      setNote({ tone: "bad", lines: body?.problems ?? [body?.message ?? "The settings were not saved."] })
      return
    }

    setView(body)
    setForm(body.settings)
    setNote({ tone: "good", lines: ["Saved.", ...(body.warnings ?? [])] })
  }

  const testConnection = async () => {
    setBusy("connection")
    setNote(undefined)

    const { ok, body } = await call("/admin/njiwa/test-connection")
    setBusy("")

    if (!ok) {
      setNote({ tone: "bad", lines: [body?.message ?? "Njiwa could not be reached."] })
      return
    }

    const numbers = (body.numbers ?? []).map(
      (number: any) =>
        `${number.msisdn ?? "no number"} — ${number.status || "unknown"}${number.is_default ? ", default" : ""}${number.label ? ` (${number.label})` : ""}`
    )

    setNote({
      tone: "good",
      lines: [
        numbers.length === 1
          ? "Njiwa answered. One number on this account:"
          : `Njiwa answered. ${numbers.length} numbers on this account:`,
        ...numbers,
        ...(body.notes ?? []),
      ],
    })
  }

  const sendTest = async () => {
    setBusy("message")
    setNote(undefined)

    const { ok, body } = await call("/admin/njiwa/test-message", {
      method: "POST",
      body: { to: testNumber },
    })
    setBusy("")

    setNote({
      tone: ok ? "good" : "bad",
      lines: [body?.message ?? (ok ? "Sent." : "The test message did not go.")],
    })
  }

  if (loadError !== "") {
    return (
      <Container>
        <Heading level="h1">Njiwa WhatsApp</Heading>
        <Text>{loadError}</Text>
      </Container>
    )
  }

  if (!view || !form) {
    return (
      <Container>
        <Heading level="h1">Njiwa WhatsApp</Heading>
        <Text>Reading your settings.</Text>
      </Container>
    )
  }

  const customerEvents = view.events.filter((event) => event.audience === "customer")
  const ownerEvents = view.events.filter((event) => event.audience === "you")

  const wording = (event: EventInfo) => (
    <div key={event.key} style={{ padding: "12px 0", borderTop: "1px solid var(--border-base, #e5e5e5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Switch
          id={`njiwa-${event.key}`}
          checked={form.events[event.key]?.enabled ?? false}
          onCheckedChange={(checked: boolean) => changeEvent(event.key, { enabled: checked })}
        />
        <Label htmlFor={`njiwa-${event.key}`}>{event.label}</Label>
      </div>
      <Text size="small" style={{ margin: "6px 0" }}>
        {event.help}
      </Text>
      <Textarea
        rows={4}
        maxLength={view.max_length}
        value={form.events[event.key]?.template ?? ""}
        onChange={(e: any) => changeEvent(event.key, { template: e.target.value })}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <Text size="small">
          Empty wording sends nothing, which is how one message is turned off without turning the
          event off.
        </Text>
        <Button
          size="small"
          variant="transparent"
          onClick={() => changeEvent(event.key, { template: event.default_template })}
        >
          Use the wording it came with
        </Button>
      </div>
    </div>
  )

  return (
    <Container>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Heading level="h1">Njiwa WhatsApp</Heading>
        <Button onClick={save} isLoading={busy === "save"} disabled={busy !== ""}>
          Save
        </Button>
      </div>

      {note ? (
        <div
          style={{
            margin: "12px 0",
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border-base, #e5e5e5)",
            borderLeft: `3px solid ${note.tone === "good" ? "#3b8a63" : "#a13a2f"}`,
          }}
        >
          {note.lines.map((line, index) => (
            <Text key={index} size="small" weight={index === 0 ? "plus" : "regular"}>
              {line}
            </Text>
          ))}
        </div>
      ) : null}

      <div style={{ padding: "16px 0" }}>
        <Heading level="h2">Connection</Heading>
        <Text size="small">Njiwa sends the WhatsApp messages. Your shop tells it when.</Text>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0" }}>
          <Switch
            id="njiwa-enabled"
            checked={form.enabled}
            onCheckedChange={(checked: boolean) => change({ enabled: checked })}
          />
          <Label htmlFor="njiwa-enabled">Send WhatsApp messages</Label>
        </div>
        <Text size="small">
          The master switch. Turn it off and this plugin stops sending anything at all, without
          losing your key, your numbers or your wording. Orders carry on exactly as before.
        </Text>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
          <Text size="small" weight="plus">
            API key
          </Text>
          {view.boot_only.api_key_set ? (
            <Badge color={view.boot_only.test_key ? "orange" : "green"}>
              {view.boot_only.test_key ? "test key" : "live key"}
            </Badge>
          ) : (
            <Badge color="red">not set</Badge>
          )}
          <Text size="small">{view.boot_only.base_url}</Text>
        </div>
        <Text size="small">
          {view.boot_only.test_key
            ? "A test key checks and stores every message and delivers nothing, which is what you want while you set this up. "
            : ""}
          {view.boot_only.why}
        </Text>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-send-from">Send from</Label>
          <Input
            id="njiwa-send-from"
            value={form.sendFrom}
            placeholder="254712345678"
            onChange={(e: any) => change({ sendFrom: e.target.value })}
          />
          <Text size="small">
            Which of your linked WhatsApp numbers these messages come from. Digits only, with the
            country code. Leave it empty to use the number marked default in the Njiwa console,
            which is the right answer if you have one number.
          </Text>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={testConnection} isLoading={busy === "connection"} disabled={busy !== ""}>
            Test connection
          </Button>
          <Input
            value={testNumber}
            placeholder="254712345678"
            onChange={(e: any) => setTestNumber(e.target.value)}
          />
          <Button variant="secondary" onClick={sendTest} isLoading={busy === "message"} disabled={busy !== ""}>
            Send test message
          </Button>
        </div>
        <Text size="small" style={{ marginTop: 6 }}>
          Test connection lists the numbers your account really has and sends nothing. Send test
          message sends one fixed message to the number you type, or to the first of your own
          numbers below if you leave it empty. Both use the settings as they are saved, not as they
          are on screen, so save first.
        </Text>
      </div>

      <div style={{ padding: "16px 0" }}>
        <Heading level="h2">Messages to your customers</Heading>
        <Text size="small">
          Each message is plain text. Anything in braces is filled in from the order.
        </Text>
        <div style={{ margin: "8px 0" }}>
          {Object.entries(view.placeholders).map(([token, meaning]) => (
            <Text key={token} size="small">
              <code>{token}</code> — {meaning}
            </Text>
          ))}
        </div>
        {customerEvents.map(wording)}
      </div>

      <div style={{ padding: "16px 0" }}>
        <Heading level="h2">The message to you</Heading>
        <Text size="small">
          One message when an order becomes real. It is sent the moment the order exists, not when
          somebody reaches the payment page, so an abandoned checkout never wakes you up.
        </Text>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-admin-numbers">Your WhatsApp numbers</Label>
          <Input
            id="njiwa-admin-numbers"
            value={form.adminNumbers}
            placeholder="254712345678, 254733000111"
            onChange={(e: any) => change({ adminNumbers: e.target.value })}
          />
          <Text size="small">
            Where that message goes. Digits only, with the country code, separated by commas if
            there are several. Everybody listed gets their own copy. Only phone numbers are
            accepted: a WhatsApp group address is dropped, because one new order posted to a group
            would message hundreds of people from your own number.
          </Text>
        </div>

        {ownerEvents.map(wording)}
      </div>

      <div style={{ padding: "16px 0" }}>
        <Heading level="h2">Your shop</Heading>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-shop-name">Shop name</Label>
          <Input
            id="njiwa-shop-name"
            value={form.shopName}
            placeholder={view.fallbacks.shopName || "Your shop"}
            onChange={(e: any) => change({ shopName: e.target.value })}
          />
          <Text size="small">
            What <code>{"{shop_name}"}</code> becomes. Empty uses the name of your Medusa store.
          </Text>
        </div>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-locale">Language tag</Label>
          <Input
            id="njiwa-locale"
            value={form.locale}
            placeholder="en-US"
            onChange={(e: any) => change({ locale: e.target.value })}
          />
          <Text size="small">
            How money and dates are written in messages, such as en-KE or de-DE.
          </Text>
        </div>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-storefront-url">Your storefront's order page</Label>
          <Input
            id="njiwa-storefront-url"
            value={form.storefrontOrderUrl}
            placeholder="https://shop.example.com/order/{order_id}/confirmed"
            onChange={(e: any) => change({ storefrontOrderUrl: e.target.value })}
          />
          <Text size="small">
            With <code>{"{order_id}"}</code> where the id goes, so <code>{"{order_url}"}</code> has
            something to be. Empty leaves it empty.
          </Text>
        </div>

        <div style={{ margin: "12px 0" }}>
          <Label htmlFor="njiwa-admin-url">Where your admin can be reached</Label>
          <Input
            id="njiwa-admin-url"
            value={form.adminUrl}
            placeholder={view.fallbacks.adminUrl || "https://shop.example.com/app"}
            onChange={(e: any) => change({ adminUrl: e.target.value })}
          />
          <Text size="small">
            What <code>{"{admin_url}"}</code> is built from, so the message to you opens the order
            on your phone. Empty uses the address Medusa already knows about, shown here in grey.
          </Text>
        </div>
      </div>

      <Button onClick={save} isLoading={busy === "save"} disabled={busy !== ""}>
        Save
      </Button>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Njiwa WhatsApp",
})

export default NjiwaSettingsPage
