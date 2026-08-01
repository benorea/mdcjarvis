import webpush from "web-push";
import { getSupabaseServer } from "./supabase";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    "mailto:jarvis@maydayco.dog",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type PushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends `payload` (JSON-stringified) to every stored subscription, pruning any that are no longer valid. */
export async function sendPushToAll(payload: { title: string; body: string }): Promise<number> {
  ensureConfigured();
  const supabase = getSupabaseServer();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  let sent = 0;
  for (const sub of (subs as PushSubscriptionRow[]) || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: any) {
      // 404/410 = the browser unsubscribed or the endpoint expired — clean it up.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error(`push to ${sub.id} failed`, err);
      }
    }
  }
  return sent;
}
