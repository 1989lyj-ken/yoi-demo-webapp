/**
 * UX-1010 F15: a short message above the bottom navigation (dark pill, white text), gone after 3 seconds.
 * It never takes focus or blocks a tap; screen readers hear it through role="status".
 */
let timer: number | undefined;

export function showToast(text: string): void {
  let el = document.querySelector<HTMLElement>("#yo-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "yo-toast";
    el.className = "yo-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.remove("yo-toast--out");
  el.classList.add("yo-toast--in");
  window.clearTimeout(timer);
  const shown = el;
  timer = window.setTimeout(() => {
    shown.classList.remove("yo-toast--in");
    shown.classList.add("yo-toast--out");
  }, 3000);
}

/** F15: the claim and catch-up messages (1 point is 1 dollar of fare). */
export function claimToast(day: "today" | "yesterday", points: number): string {
  return `${day === "today" ? "已領取" : "已補領"} ${points} 點，可以折 $${points} 車資`;
}
