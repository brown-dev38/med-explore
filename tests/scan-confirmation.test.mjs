import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

function scanner() {
  const values = [];
  const checkoutRequest = { current: null };
  const navigations = [];
  let updates = 0;
  let cursor = 0;
  let lastToken;
  let pendingEffect;
  let cleanup;
  let token = "checkout-token";
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (next) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
      },
      useRef: () => checkoutRequest,
      useCallback: (callback) => callback,
      useEffect(effect, [nextToken]) {
        if (nextToken !== lastToken) { lastToken = nextToken; pendingEffect = effect; }
      },
    },
    "next/link": "a", "lucide-react": {},
    "next/navigation": { useRouter: () => ({ replace: (url) => navigations.push(url) }), useSearchParams: () => new URLSearchParams({ token }) },
    "@/components/qr-scanner": { QrScanner: "scanner" },
    "@/lib/activity-live": { notifyActivityUpdate: () => { updates++; } },
  };
  for (const [file, names] of [
    ["button", ["Button"]], ["input", ["Input"]], ["label", ["Label"]],
    ["card", ["Card", "CardContent", "CardDescription", "CardFooter", "CardHeader", "CardTitle"]],
    ["alert", ["Alert", "AlertDescription", "AlertTitle"]],
  ]) mocks[`@/components/ui/${file}`] = Object.fromEntries(names.map((name) => [name, name]));
  const { ScanClient } = loadTypeScript("../app/scan/scan-client.tsx", mocks);
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    if (typeof node === "string" || typeof node === "number") return String(node);
    return node && typeof node === "object" ? text(node.props?.children) : "";
  }
  function render() {
    cursor = 0;
    const result = nodes(ScanClient({ academicYearId: "2", academicYearCode: "2570" }));
    if (pendingEffect) {
      const effect = pendingEffect; pendingEffect = null;
      cleanup?.(); cleanup = effect();
    }
    return result;
  }
  const settle = async () => { await new Promise(setImmediate); return render(); };
  return {
    render, settle, text, navigations, updates: () => updates,
    confirm: () => render().find((node) => node.type === "Button" && text(node) === "ยืนยัน Check-out"),
    changeToken: (next) => { token = next; return render(); },
    unmount: () => cleanup?.(),
  };
}

const preview = (purpose = "CHECK_IN") => Response.json({ success: true, data: { purpose } });

test("an invalid QR has no confirmation button and never posts attendance", async (context) => {
  const request = context.mock.method(globalThis, "fetch", async () => Response.json({ message: "QR หมดอายุแล้ว" }, { status: 400 }));
  const ui = scanner(); ui.render(); await ui.settle();
  assert.equal(request.mock.callCount(), 1);
  assert.equal(ui.confirm(), undefined);
  assert.equal(ui.updates(), 0);
  assert.ok(ui.render().some((node) => node.type === "AlertDescription" && ui.text(node) === "QR หมดอายุแล้ว"));
  ui.unmount();
});

test("check-in retains the simple button for a new participant without an unregistered warning", async (context) => {
  context.mock.method(globalThis, "fetch", async (_url, options = {}) => options.method === "POST"
    ? Response.json({ code: "NOT_REGISTERED", message: "คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้", activity: { id: "4", status: "PUBLISHED" } }, { status: 400 }) : preview("CHECK_IN"));
  const ui = scanner(); ui.render(); const nodes = await ui.settle();
  assert.ok(nodes.some((node) => node.type === "Button" && ui.text(node) === "Check-in เข้างาน"));
  assert.ok(!nodes.some((node) => node.type === "AlertTitle" && ui.text(node).includes("ยังไม่ได้ลงทะเบียน")));
  assert.equal(ui.confirm(), undefined);
  ui.unmount();
});

test("successful check-in notifies activity views, including registration before check-in", async (context) => {
  let registered = false;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (url.includes("participations")) {
      registered = true;
      return Response.json({ success: true }, { status: 201 });
    }
    if (options.method !== "POST") return preview("CHECK_IN");
    if (!registered) return Response.json({ code: "NOT_REGISTERED", activity: { id: "4", status: "PUBLISHED" } }, { status: 400 });
    return Response.json({ data: { eventType: "CHECK_IN" } }, { status: 201 });
  });
  const ui = scanner(); ui.render(); await ui.settle();
  assert.equal(ui.updates(), 0);
  const checkIn = ui.render().find((node) => node.type === "Button" && ui.text(node) === "Check-in เข้างาน");
  await checkIn.props.onClick();
  assert.equal(ui.updates(), 2);
  assert.ok(ui.render().some((node) => node.type === "AlertDescription" && ui.text(node).includes("บันทึกเช็คอินสำเร็จ")));
  ui.unmount();
});

test("a rejected year preview never posts attendance or offers check-in or check-out", async (context) => {
  const request = context.mock.method(globalThis, "fetch", async () => Response.json({ message: "QR นี้เป็นกิจกรรมคนละปีการศึกษากับปีที่เลือก" }, { status: 409 }));
  const ui = scanner(); ui.render(); await ui.settle();
  assert.equal(request.mock.callCount(), 1);
  assert.equal(ui.confirm(), undefined);
  assert.ok(!ui.render().some((node) => node.type === "Button" && ui.text(node) === "Check-in เข้างาน"));
  assert.ok(ui.render().some((node) => node.type === "AlertDescription" && ui.text(node).includes("คนละปีการศึกษา")));
  ui.unmount();
});

test("scanning a QR preserves the selected year even when its URL contains a different year", () => {
  const ui = scanner();
  ui.changeToken("");
  const camera = ui.render().find((node) => node.type === "Button" && ui.text(node).includes("เปิดกล้อง"));
  camera.props.onClick();
  ui.render().find((node) => node.type === "scanner").props.onDetected("https://example.test/scan?token=new-token&academicYearId=99");
  const destination = new URL(ui.navigations[0], "https://example.test");
  assert.equal(destination.searchParams.get("academicYearId"), "2");
  assert.equal(destination.searchParams.get("token"), "new-token");
  ui.unmount();
});
