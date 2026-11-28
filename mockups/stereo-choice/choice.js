// Throwaway prototype logic shared by the three stereo-choice pages.
(() => {
const scenes = window.STEREO_SCENES;
const params = new URLSearchParams(location.search);
const scene = scenes.find((s) => s.id === params.get("s")) ?? scenes[0];
const VERDICT = {
  correct: { cls: "good", head: "Correct" },
  plausible: { cls: "plausible", head: "This forms too, but it is the minor product" },
  wrong: { cls: "wrong", head: "Not this one" },
};
function header(protoName) {
  const links = scenes.map((s) => `<a class="btn sm${s.id === scene.id ? " primary" : ""}" href="?s=${s.id}">${s.title}</a>`).join(" ");
  document.getElementById("head").innerHTML = `
    <div class="row spread mt"><div><span class="pill new">Prototype ${protoName}</span>
    <h1 style="margin:6px 0 0">${scene.title}</h1><div class="muted">${scene.reaction}</div></div>
    <a class="btn sm" href="index.html">All prototypes</a></div>
    <div class="row mt small">${links}</div>`;
}
function optionCard(option, index) {
  const body = option.mixture ? `<div class="mixture">½ + ½</div>` : option.svg;
  return `<button class="option" data-i="${index}" aria-pressed="false">${body}<div class="lbl">${option.label}</div>${option.note ? `<div class="note">${option.note}</div>` : ""}</button>`;
}
function feedbackHtml(option) {
  const v = VERDICT[option.verdict];
  return `<div class="fb ${v.cls}"><h3>${v.head}</h3><p>${option.why}</p></div>`;
}
window.Choice = { scene, header, optionCard, feedbackHtml, VERDICT };
})();
