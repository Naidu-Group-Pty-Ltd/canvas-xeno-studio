// G-DEVICES: a laptop, a tablet and a phone, drawn in CSS as objects in 3D (each a set of flat faces in a
// preserve-3d group), and the screens they carry for shot 12.4: the Command Centre on the laptop (PL-05A-a, the
// record graded A+), the Client Portal on the tablet (PL-06A-a, Jordan Ellis's dashboard) and the Builders
// Network on the phone, laid out as the portal lays itself out at a phone's width (its own obsidian, teal and
// setout grid, Daniel Reed's Stock List with 14 Wattle Grove Selected for a client). Each screen carries the
// products' toast, Matter updated, hidden until the scene shows it, and a band of light to cross it as it updates.
//   const DV = require("./pages/devices.cjs");
//   DV.laptop({ id, plate }), DV.tablet({ id, plate }), DV.phone({ id, html })  // a device's markup
//   DV.builderMobile()      // the phone's page, { html, css: [w, h] }
//   DV.CSS                  // the devices' stylesheet
//   DV.SIZE                 // each device's faces, in CSS px (for the scene's geometry)
const F = require("../frames.cjs");

// The devices' faces (CSS px): the laptop's lid and base, the tablet's and the phone's bodies, and their screens.
const SIZE = {
  laptop: { lid: [720, 430], screen: [688, 387], bezel: [16, 18], base: [760, 470], tilt: 14 },
  tablet: { body: [560, 380], screen: [528, 330], bezel: [16, 25] },
  phone: { body: [272, 560], screen: [250, 538], bezel: [11, 11] },
};

const CSS = `
.dv { position:absolute; left:0; top:0; width:0; height:0; transform-style:preserve-3d; transform-origin:0 0; }
.dv-face { position:absolute; transform-origin:0 0; }
.dv-screen { position:absolute; overflow:hidden; background:#000; }
.dv-screen .fk-scale { position:absolute; left:0; top:0; transform-origin:0 0; }
.dv-glare { position:absolute; inset:0; pointer-events:none; background:linear-gradient(118deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 70%, rgba(255,255,255,.035) 100%); }
.dv-sweep { position:absolute; inset:-10%; pointer-events:none; opacity:0;
  background:linear-gradient(105deg, rgba(255,255,255,0) 35%, rgba(255,247,222,.55) 50%, rgba(255,255,255,0) 65%); background-size:260% 100%; background-repeat:no-repeat; }
.dv-flash { position:absolute; inset:0; pointer-events:none; opacity:0; box-shadow:inset 0 0 0 2px rgba(215,179,95,.9), inset 0 0 60px rgba(215,179,95,.35); }
/* the products' toast (portals.cjs .ftoast), at each screen's own scale */
.dv-toast { position:absolute; display:flex; align-items:center; gap:.62em; padding:.72em 1em .72em .9em; border-radius:.75em; border:1px solid rgba(255,255,255,.16);
  background:#16171d; color:#fff; font:600 1em/1 Inter, Selawik, "Segoe UI", sans-serif; white-space:nowrap; box-shadow:0 .9em 2.4em rgba(0,0,0,.6); visibility:hidden; opacity:0; }
.dv-toast svg { width:1.15em; height:1.15em; flex:none; }
.dv-toast small { margin-left:.9em; color:#8d95a8; font-weight:600; }
/* the laptop: a lid in space grey round a black bezel, the base its keyboard deck */
.dv-lid { border-radius:20px; background:linear-gradient(180deg,#3a3f49,#1d2027 60%,#16181d); padding:2px; box-shadow:0 40px 90px rgba(0,0,0,.55); }
.dv-lid > .dv-bez { position:absolute; inset:2px; border-radius:18px; background:#050608; }
.dv-cam { position:absolute; left:50%; width:6px; height:6px; margin-left:-3px; border-radius:50%; background:#1a1e26; box-shadow:inset 0 0 0 1px #2c323d; }
.dv-base { border-radius:4px 4px 28px 28px; background:linear-gradient(180deg,#2e333c,#23272e 40%,#1a1d23); box-shadow:inset 0 2px 0 rgba(255,255,255,.08); }
.dv-base .dv-keys { position:absolute; left:7%; right:7%; top:7%; height:46%; border-radius:6px; background:#0c0e12;
  background-image:repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 41px), repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 38px); }
.dv-base .dv-pad { position:absolute; left:34%; right:34%; top:60%; height:30%; border-radius:8px; background:rgba(255,255,255,.035); box-shadow:inset 0 0 0 1px rgba(255,255,255,.06); }
/* the tablet and the phone: black glass in a thin metal edge */
.dv-body { border-radius:30px; background:#07080b; box-shadow:inset 0 0 0 2px #2f343e, inset 0 0 0 4px #0b0c10, 0 40px 90px rgba(0,0,0,.55); }
.dv-phone.dv-body { border-radius:44px; }
.dv-island { position:absolute; left:50%; top:18px; width:86px; height:24px; margin-left:-43px; border-radius:14px; background:#000; z-index:3; }
/* the Builders Network at a phone's width (portals.cjs .bn, its own palette and type) */
.bnm { position:absolute; inset:0; color:#fff; font-family:Inter, sans-serif; overflow:hidden;
  background:radial-gradient(circle at top left, rgba(0,168,181,.12), transparent 40%), linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px) 0 0/24px 24px,
    linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px) 0 0/24px 24px, #040B16; }
.bnm .bm-ann, .bnm .bm-chip, .bnm .bm-s { font-family:Inconsolata, Consolas, monospace; }
.bnm .bm-sb { height:54px; display:flex; align-items:flex-end; justify-content:space-between; padding:0 28px 8px 34px; font-size:15px; font-weight:600; }
.bnm .bm-sb svg { height:13px; }
.bnm .bm-top { display:flex; align-items:center; gap:10px; padding:10px 18px 12px; border-bottom:1px solid #1C2B41; background:rgba(7,18,34,.88); }
.bnm .bm-mark { width:30px; height:30px; flex:none; background:center/contain no-repeat; }
.bnm .bm-top .bm-t { font-size:13.5px; font-weight:700; }
.bnm .bm-top .bm-s { font-size:8px; letter-spacing:.14em; color:#9CA3AF; margin-top:2px; }
.bnm .bm-top svg { margin-left:auto; width:18px; height:18px; }
.bnm .bm-body { padding:16px 16px 0; display:flex; flex-direction:column; gap:12px; }
.bnm .bm-h { font-family:"Playfair Display", Georgia, serif; font-weight:600; font-size:24px; letter-spacing:-.01em; }
.bnm .bm-panel { border:1px solid #1C2B41; border-radius:6px; background:rgba(11,22,44,.78); padding:12px 13px; display:flex; flex-direction:column; gap:6px; }
.bnm .bm-panel .bm-pt { font-family:"Playfair Display", Georgia, serif; font-weight:600; font-size:16px; }
.bnm .bm-panel .bm-pl { font-size:12.5px; font-weight:600; }
.bnm .bm-panel .bm-pd { font-size:10.5px; color:#9CA3AF; }
.bnm .bm-ack { align-self:flex-start; display:inline-flex; align-items:center; gap:6px; margin-top:4px; padding:7px 11px; border-radius:6px; border:1px solid rgba(0,168,181,.55); font-size:11.5px; font-weight:600; color:#e6f7f8; }
.bnm .bm-ack svg { width:13px; height:13px; }
.bnm .bm-card { border:1px solid rgba(0,168,181,.25); border-radius:6px; overflow:hidden; background:radial-gradient(300px 160px at 100% 0%, rgba(0,168,181,.10), transparent 70%), rgba(18,32,54,.9); }
.bnm .bm-photo { height:178px; background:#122036 center 42%/cover no-repeat; border-bottom:1px solid #1C2B41; }
.bnm .bm-sheet { padding:11px 13px 14px; display:flex; flex-direction:column; gap:7px; }
.bnm .bm-ann { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:#22C3CE; font-weight:700; }
.bnm .bm-tt { font-size:17px; font-weight:600; letter-spacing:-.02em; line-height:1.2; }
.bnm .bm-chip { align-self:flex-start; font-size:8.5px; letter-spacing:.12em; font-weight:700; padding:3px 7px; border-radius:3px; border:1px solid rgba(200,155,60,.55); background:rgba(200,155,60,.10); color:#E2B85A; }
.bnm .bm-row { display:flex; align-items:baseline; justify-content:space-between; border-top:1px solid #2a3b55; padding-top:8px; }
.bnm .bm-price { font-size:19px; font-weight:600; font-variant-numeric:tabular-nums; }
.bnm .bm-spec { font-size:11px; color:#9CA3AF; }
`;

const TICK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#45d58a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';
/** The products' toast, at `size` px a line, placed by `style` on the screen. */
const toast = (id, size, style) =>
  `<div class="dv-toast" id="${id}" style="font-size:${size}px;${style}">${TICK}Matter updated<small>×</small></div>`;
/** A screen: the plate scaled to the screen's width (cropped from its top), its glare, its sweep and its toast. */
function screen(id, [w, h], { plate, html, scaleTo = "width", toastSize, toastStyle }) {
  const inner = plate
    ? (() => {
        const k = scaleTo === "width" ? w / plate.css[0] : h / plate.css[1];
        return `<div class="fk-scale" style="width:${plate.css[0]}px;height:${plate.css[1]}px;transform:scale(${k.toFixed(5)})">${plate.html}</div>`;
      })()
    : html;
  return `${inner}<div class="dv-glare"></div><div class="dv-flash" id="${id}-flash"></div><div class="dv-sweep" id="${id}-sweep"></div>${toast(`${id}-toast`, toastSize, toastStyle)}`;
}

/** The laptop: its lid (hinged at its foot and tilted back) and its keyboard deck, centred on the hinge. */
function laptop({ id, plate }) {
  const { lid, screen: sc, bezel, base, tilt } = SIZE.laptop;
  const [lw, lh] = lid;
  const [bw, bd] = base;
  return `<div class="dv" id="${id}">
    <div class="dv-face dv-base" id="${id}-base" style="left:${-bw / 2}px;top:0;width:${bw}px;height:${bd}px;transform-origin:${bw / 2}px 0;transform:rotateX(90deg)"><div class="dv-keys"></div><div class="dv-pad"></div></div>
    <div class="dv-face dv-lid" id="${id}-lid" style="left:${-lw / 2}px;top:${-lh}px;width:${lw}px;height:${lh}px;transform-origin:${lw / 2}px ${lh}px;transform:rotateX(${tilt}deg)">
      <div class="dv-bez"></div><div class="dv-cam" style="top:${bezel[1] / 2 - 3}px"></div>
      <div class="dv-screen" style="left:${bezel[0]}px;top:${bezel[1]}px;width:${sc[0]}px;height:${sc[1]}px;border-radius:3px">${screen(id, sc, { plate, toastSize: 15, toastStyle: "right:16px;bottom:52px" })}</div>
    </div></div>`;
}
/** The tablet, landscape, centred. */
function tablet({ id, plate }) {
  const { body, screen: sc, bezel } = SIZE.tablet;
  const [w, h] = body;
  return `<div class="dv" id="${id}"><div class="dv-face dv-body" id="${id}-body" style="left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px">
      <div class="dv-cam" style="top:${bezel[1] / 2 - 3}px"></div>
      <div class="dv-screen" style="left:${bezel[0]}px;top:${bezel[1]}px;width:${sc[0]}px;height:${sc[1]}px;border-radius:10px">${screen(id, sc, { plate, toastSize: 14, toastStyle: "right:16px;bottom:14px" })}</div>
    </div></div>`;
}
/** The phone, portrait, centred. */
function phone({ id, page }) {
  const { body, screen: sc, bezel } = SIZE.phone;
  const [w, h] = body;
  const k = sc[0] / page.css[0];
  const inner = `<div class="fk-scale" style="width:${page.css[0]}px;height:${page.css[1]}px;transform:scale(${k.toFixed(5)})">${page.html}</div>`;
  return `<div class="dv" id="${id}"><div class="dv-face dv-body dv-phone" id="${id}-body" style="left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px">
      <div class="dv-screen" style="left:${bezel[0]}px;top:${bezel[1]}px;width:${sc[0]}px;height:${sc[1]}px;border-radius:34px">${screen(id, sc, { html: inner, toastSize: 12.5, toastStyle: "left:50%;bottom:22px;transform:translateX(-50%)" })}<div class="dv-island"></div></div>
    </div></div>`;
}

/** A listing with no photographs yet, in the portal's drafting language: its front elevation, line work only. */
const ELEVATION = (() => {
  const L = 'stroke="#22C3CE" stroke-opacity=".55" stroke-width="1.2" fill="none"';
  const garage = [118, 124, 130, 136, 142].map((y) => `<path d="M64 ${y}h84" ${L} stroke-opacity=".3"/>`).join("");
  return `<svg viewBox="0 0 358 178" width="100%" height="100%" font-family="Inconsolata, monospace">
    <text x="16" y="22" font-size="8.5" letter-spacing="1.4" fill="#22C3CE" fill-opacity=".7">FRONT ELEVATION</text>
    <path d="M36 104 120 62h118l84 42" ${L}/><path d="M46 104v46M312 104v46M36 104h286" ${L}/>
    <path d="M20 150h318" ${L} stroke-opacity=".8"/>
    <rect x="60" y="112" width="92" height="38" ${L}/>${garage}
    <rect x="178" y="114" width="18" height="36" ${L}/><rect x="199" y="114" width="6" height="36" ${L} stroke-opacity=".35"/>
    <rect x="218" y="116" width="44" height="22" ${L}/><path d="M240 116v22" ${L} stroke-opacity=".35"/>
    <rect x="274" y="116" width="26" height="22" ${L}/>
    <path d="M46 164h266M46 160v8M312 160v8" ${L} stroke-opacity=".4"/>
    <text x="179" y="174" font-size="8" text-anchor="middle" fill="#9CA3AF" fill-opacity=".8">11 400</text></svg>`;
})();

/** The Builders Network's Stock List at a phone's width: the selection for a buyer, and 14 Wattle Grove. */
function builderMobile() {
  const W = 390;
  const H = Math.round((W * SIZE.phone.screen[1]) / SIZE.phone.screen[0]);
  const P = F.asset("P.png");
  const MARK = F.asset("bn-mark.png");
  const bell =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#cfd5df" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const check =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#22C3CE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
  const bars =
    '<svg viewBox="0 0 64 13"><g fill="#fff"><rect x="0" y="8" width="3.4" height="5" rx="1"/><rect x="5" y="5.5" width="3.4" height="7.5" rx="1"/><rect x="10" y="3" width="3.4" height="10" rx="1"/><rect x="15" y="0" width="3.4" height="13" rx="1"/>' +
    '<path d="M30 3.6a8.6 8.6 0 0 1 11.6 0l-1.3 1.4a6.6 6.6 0 0 0-9 0zM32.5 6.3a5 5 0 0 1 6.6 0l-1.3 1.4a3 3 0 0 0-4 0zM35.8 9.2l1.4 1.5-1.4 1.5-1.4-1.5z"/>' +
    '<rect x="46" y="1" width="16" height="11" rx="3" fill="none" stroke="#fff" stroke-opacity=".5"/><rect x="47.6" y="2.6" width="11.4" height="7.8" rx="1.6"/><rect x="62.6" y="4.5" width="1.4" height="4" rx=".7" fill-opacity=".5"/></g></svg>';
  const html = `<div class="bnm">
    <div class="bm-sb"><span>9:41</span>${bars}</div>
    <div class="bm-top"><div class="bm-mark" style="${MARK ? `background-image:url('${MARK}')` : ""}"></div><div><div class="bm-t">Aurixa Builders Network</div><div class="bm-s">BUILDER / DEVELOPER PORTAL</div></div>${bell}</div>
    <div class="bm-body">
      <div class="bm-h">Stock List</div>
      <div class="bm-panel"><div class="bm-pt">Selected for a buyer</div><div class="bm-pl">Lot 14 · 14 Wattle Grove, Banksia Rise</div>
        <div class="bm-pd">Selected 21/10/2026 · by Aurixa Systems · A. Morgan</div><span class="bm-ack">${check}Acknowledge</span></div>
      <div class="bm-card"><div class="bm-photo" style="${P ? `background-image:url('${P}')` : ""}"></div>
        <div class="bm-sheet"><div class="bm-ann">BANKSIA RISE · HOUSE AND LAND</div><div class="bm-tt">Lot 14 · 14 Wattle Grove, Banksia Rise</div>
          <span class="bm-chip">SELECTED FOR A CLIENT</span>
          <div class="bm-row"><span class="bm-price">$1,150,000</span><span class="bm-spec">4 bed · 2 bath · 2 car</span></div></div></div>
      <div class="bm-card" style="opacity:.62"><div class="bm-photo">${ELEVATION}</div>
        <div class="bm-sheet"><div class="bm-ann">BANKSIA RISE · HOUSE AND LAND</div><div class="bm-tt">Lot 15 · 9 Ironbark Close, Banksia Rise</div>
          <div class="bm-row"><span class="bm-price">$1,085,000</span><span class="bm-spec">4 bed · 2 bath · 2 car</span></div></div></div>
    </div></div>`;
  return { html, css: [W, H] };
}

module.exports = { laptop, tablet, phone, builderMobile, CSS, SIZE };
