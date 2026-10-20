import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

function button() {
  const state = [];
  const effects = [];
  let stateCursor = 0;
  let effectCursor = 0;
  let pending = [];
  let published = 0;
  const { ActivityPublishButton } = loadTypeScript("../components/activity-publish-button.tsx", {
    react: {
      useId: () => "publication-hint",
      useState(initial) {
        const index = stateCursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (next) => { state[index] = next; }];
      },
      useEffect(effect, deps) {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          pending.push(() => {
            previous?.cleanup?.();
            effects[index] = { deps, cleanup: effect() };
          });
        }
      },
    },
    "lucide-react": {},
    "@/components/ui/button": { Button: "button" },
  });
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  return {
    render(props) {
      stateCursor = effectCursor = 0;
      pending = [];
      const result = nodes(ActivityPublishButton({ onPublish: () => { published++; }, ...props }));
      pending.forEach((effect) => effect());
      return {
        control: result.find((node) => node.type === "button"),
        hint: result.find((node) => node.props?.role === "status"),
      };
    },
    published: () => published,
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}

test("expired drafts disable publication and explain how to recover", (context) => {
  const now = new Date("2026-10-20T13:00:00+07:00");
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now });
  for (const endsAt of [now.toISOString(), "2026-10-20T11:47:00+07:00"]) {
    const ui = button();
    const { control, hint } = ui.render({ endsAt });
    assert.equal(control.props.disabled, true);
    assert.equal(control.props["aria-describedby"], hint.props.id);
    assert.match(hint.props.children.filter((item) => typeof item === "string").join(" "), /กรุณาแก้ไขเวลา/);
    control.props.onClick();
    assert.equal(ui.published(), 0);
    ui.unmount();
  }
});

test("publication disables while the page is open and re-enables after rescheduling", (context) => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-20T11:46:59+07:00") });
  const ui = button();
  const props = { endsAt: "2026-10-20T11:47:00+07:00" };
  assert.equal(ui.render(props).control.props.disabled, false);
  context.mock.timers.tick(1000);
  assert.equal(ui.render(props).control.props.disabled, true);
  const updated = ui.render({ endsAt: "2026-10-20T14:00:00+07:00" });
  assert.equal(updated.control.props.disabled, false);
  assert.equal(updated.hint, undefined);
  updated.control.props.onClick();
  assert.equal(ui.published(), 1);
  ui.unmount();
});

test("clicks recheck expiry between clock ticks and busy state also disables publication", (context) => {
  const now = new Date("2026-10-20T11:46:59.999+07:00");
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now });
  const ui = button();
  const props = { endsAt: "2026-10-20T11:47:00+07:00" };
  const { control } = ui.render(props);
  context.mock.timers.setTime(now.getTime() + 1);
  control.props.onClick();
  assert.equal(ui.published(), 0);
  assert.equal(ui.render(props).control.props.disabled, true);
  assert.equal(ui.render({ endsAt: "2026-10-20T14:00:00+07:00", disabled: true }).control.props.disabled, true);
  ui.unmount();
});
