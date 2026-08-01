import type { Notifier, NotificationPayload } from "@gla/shared";
import { loadSettings } from "../security/settings.js";

export class ConsoleNotifier implements Notifier {
  async notify(message: NotificationPayload): Promise<void> {
    console.log(`[notify] ${message.title}: ${message.body} (run ${message.runId})`);
  }
}

/** Push to the free ntfy.sh service (or self-hosted). Pixel: install the ntfy app and subscribe to the topic. */
export class NtfyNotifier implements Notifier {
  async notify(message: NotificationPayload): Promise<void> {
    const { ntfyTopic, ntfyServer } = loadSettings();
    if (!ntfyTopic) {
      console.log(`[ntfy] skipped — no topic configured`);
      return;
    }
    const url = `${ntfyServer}/${encodeURIComponent(ntfyTopic)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Title: message.title,
        Priority: "default",
        Tags: "shopping_cart",
      },
      body: message.body,
    });
    if (!res.ok) {
      throw new Error(`ntfy push failed (${res.status})`);
    }
    console.log(`[ntfy] sent to ${ntfyTopic}`);
  }
}

export class CompositeNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {}

  async notify(message: NotificationPayload): Promise<void> {
    for (const n of this.notifiers) {
      try {
        await n.notify(message);
      } catch (err) {
        console.error(`[notify] channel failed:`, err);
      }
    }
  }
}

export async function sendTestNotification(): Promise<{ ok: boolean; detail: string }> {
  const { ntfyTopic, ntfyServer } = loadSettings();
  if (!ntfyTopic) {
    return {
      ok: false,
      detail: "Set an ntfy topic first (install the ntfy app on your Pixel and subscribe).",
    };
  }
  const notifier = new NtfyNotifier();
  await notifier.notify({
    title: "Autopilot test",
    body: "If you see this on your Pixel, notifications are working.",
    runId: "test",
  });
  return { ok: true, detail: `Sent to ${ntfyServer}/${ntfyTopic}` };
}
