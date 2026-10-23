// NEW-MARKETPLACE: the Command Centre's Property Marketplace (npc-client-dashboard src/pages/Listings.tsx and
// src/components/listings/ListingGalleryCard.tsx, ListingHero.tsx, ListingCover.tsx), drawn in the Command
// Centre's own shell (PL-11A-c, its sidebar now on Property Marketplace) for shot 12.1. The page's header, its
// search and quick filters, and the gallery four cards across, each card as the product lays it out: the agency
// band over the picture, market presence, the photo count and freshness on the image, the price as the headline,
// the address under it, the specification row in its fixed order, then the enquiry.
//
// 14 Wattle Grove is the one listing with photographs (P) and carries the grade the Command Centre gave it (A+).
// Every other listing is the reel's own invention: addresses in neighbouring estates that name no real
// property, no agent and no person, each drawn with the product's own cover for a listing whose photographs
// have not landed (ListingCover: a wash by price band, the dot grid, the property glyph and the suburb), which
// the product chose precisely because a page of blank tiles reads as broken.
//   const MK = require("./pages/marketplace.cjs");
//   MK.plate()   // { html, css: [1536, 1360] } — the page in the Command Centre's shell
//   MK.TARGET    // the index of 14 Wattle Grove's card in the grid (its id is mk-card-<index>)
const F = require("../frames.cjs");

const W = 1536;
const H = 1360;

// Lucide's glyphs (the products' icon set), as the page draws them.
const L = {
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  bath: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M10 5 8 7"/><path d="M2 12h20"/><path d="M7 19v2"/><path d="M17 19v2"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  max: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  calcheck:
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  eyeoff:
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
  sliders:
    '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  calclock:
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4M8 2v4M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
};
const lu = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${L[name]}</svg>`;
// The covers' property glyphs (listingPinGlyphs.ts), solid on a 24 grid.
const GLYPH = {
  house: "M12 2.6 1.5 11.8h3.4v9.6h4.8v-5.5h4.6v5.5h4.8v-9.6h3.4Z",
  land: "M12 4.4 23.2 12 12 19.6 0.8 12ZM12 8.3 17.6 12 12 15.7 6.4 12Z",
  apartment:
    "M12.6 2.4h8.8v19h-8.8zM2.6 8.6h10v12.8h-10zM14.5 5.6h2.3v6.2h-2.3zM17.8 5.6h2.3v6.2h-2.3zM4.8 11.6h5.2v3h-5.2zM5.6 17h3.4v4.4H5.6z",
};

// The tokens the product resolves on this workspace (dark): its own neutrals, the tenant's blue as the brand
// (as every Command Centre plate draws it), and the fixed semantic colours.
const C = {
  fg: "#ebe8e3",
  muted: "#8c8c8c",
  card: "#111216",
  border: "rgba(255,255,255,.10)",
  brand: "#2b4cf0",
  success: "#22c55e",
  info: "#30b9fd",
  warning: "#d9a520",
  gold: "#e5b93a",
};
// ListingCover's wash by price band (price < 600k low, < 1.1M mid, < 2.5M high, else top).
const WASH = {
  low: ["rgba(48,185,253,.25)", "rgba(48,185,253,.10)"],
  mid: ["rgba(34,197,94,.25)", "rgba(34,197,94,.10)"],
  high: ["rgba(43,76,240,.45)", "rgba(43,76,240,.18)"],
  top: ["rgba(217,165,32,.30)", "rgba(217,165,32,.12)"],
};
const band = (price) => (price < 600000 ? "low" : price < 1100000 ? "mid" : price < 2500000 ? "high" : "top");
const PRESENCE = {
  on: ["On market", C.success, "#fff"],
  off: ["Off market", C.brand, "#fff"],
  soon: ["Coming soon", C.info, "#0d0d0d"],
  offer: ["Under offer", C.warning, "#0d0d0d"],
};

// The listings, in the grid's order: 14 Wattle Grove third, where the camera comes to rest.
const LISTINGS = [
  {
    price: 985000,
    address: "27 Hakea Street",
    locality: "Saltbush Vale NSW",
    beds: 4,
    baths: 2,
    cars: 2,
    land: 512,
    type: "House",
    presence: "on",
    agency: "SALTBUSH VALE SALES",
    fresh: "Added 2 days ago",
    inspect: "Sat 25 Oct, 10:30 am",
    glyph: "house",
  },
  {
    price: 1320000,
    address: "8 Wollemi Way",
    locality: "Grevillea Heights NSW",
    beds: 5,
    baths: 3,
    cars: 2,
    land: 620,
    type: "House",
    presence: "soon",
    agency: "GREVILLEA HEIGHTS SALES",
    fresh: "Added 4 days ago",
    glyph: "house",
  },
  {
    target: true,
    price: 1150000,
    address: "14 Wattle Grove",
    locality: "Banksia Rise NSW",
    beds: 4,
    baths: 2,
    cars: 2,
    land: 450,
    type: "New build",
    presence: "off",
    agency: "REED CONSTRUCTIONS",
    contact: "Daniel Reed",
    fresh: "New",
    photos: 6,
    grade: "A+",
  },
  {
    price: 899000,
    address: "3/41 Callistemon Avenue",
    locality: "Banksia Rise NSW",
    beds: 3,
    baths: 2,
    cars: 1,
    type: "Townhouse",
    presence: "offer",
    agency: "BANKSIA RISE ESTATE OFFICE",
    fresh: "Added 1 week ago",
    glyph: "apartment",
  },
  {
    price: 1085000,
    address: "9 Ironbark Close",
    locality: "Banksia Rise NSW",
    beds: 4,
    baths: 2,
    cars: 2,
    land: 400,
    type: "New build",
    presence: "off",
    agency: "REED CONSTRUCTIONS",
    contact: "Daniel Reed",
    fresh: "Added 3 days ago",
    glyph: "house",
  },
  {
    price: 1640000,
    address: "15 Waratah Drive",
    locality: "Tallowwood Park NSW",
    beds: 5,
    baths: 3,
    cars: 2,
    land: 700,
    type: "House",
    presence: "on",
    agency: "TALLOWWOOD PARK SALES",
    fresh: "Added 5 days ago",
    inspect: "Sat 25 Oct, 12:00 pm",
    glyph: "house",
  },
  {
    price: 695000,
    address: "Lot 22 Lomandra Street",
    locality: "Saltbush Vale NSW",
    land: 375,
    type: "Land",
    presence: "off",
    agency: "SALTBUSH VALE SALES",
    fresh: "Added 6 days ago",
    glyph: "land",
  },
  {
    price: 1210000,
    address: "6 Boronia Place",
    locality: "Bottlebrush Hill NSW",
    beds: 4,
    baths: 2,
    cars: 2,
    land: 540,
    type: "House",
    presence: "soon",
    agency: "PRIVATE LISTING",
    fresh: "Added 1 week ago",
    glyph: "house",
  },
  {
    price: 925000,
    address: "12 Correa Lane",
    locality: "Grevillea Heights NSW",
    beds: 4,
    baths: 2,
    cars: 1,
    land: 420,
    type: "House",
    presence: "on",
    agency: "GREVILLEA HEIGHTS SALES",
    fresh: "Added 2 weeks ago",
    glyph: "house",
  },
  {
    price: 1050000,
    address: "30 Acacia Terrace",
    locality: "Banksia Rise NSW",
    beds: 4,
    baths: 2,
    cars: 2,
    land: 448,
    type: "New build",
    presence: "off",
    agency: "BANKSIA RISE ESTATE OFFICE",
    fresh: "Added 2 weeks ago",
    glyph: "house",
  },
  {
    price: 879000,
    address: "2/18 Melaleuca Road",
    locality: "Saltbush Vale NSW",
    beds: 3,
    baths: 2,
    cars: 1,
    type: "Townhouse",
    presence: "on",
    agency: "SALTBUSH VALE SALES",
    fresh: "Added 3 weeks ago",
    glyph: "apartment",
  },
  {
    price: 1395000,
    address: "5 Kurrajong Crescent",
    locality: "Tallowwood Park NSW",
    beds: 5,
    baths: 2,
    cars: 2,
    land: 610,
    type: "House",
    presence: "soon",
    agency: "TALLOWWOOD PARK SALES",
    fresh: "Added 3 weeks ago",
    glyph: "house",
  },
];
const TARGET = LISTINGS.findIndex((l) => l.target);
const money = (v) => `$${v.toLocaleString("en-AU")}`;

const CSS = `
.ccr .mk { display:flex; flex-direction:column; gap:18px; padding:0 2px; color:${C.fg}; font-family:Selawik, "Segoe UI", Inter, sans-serif; }
.ccr .mk-sec { position:relative; overflow:hidden; border-radius:28px; border:1px solid ${C.border}; background:rgba(9,9,13,.55);
  box-shadow:0 14px 40px rgba(0,0,0,.25); padding:24px 26px; }
.ccr .mk-head { display:flex; align-items:flex-end; gap:20px;
  background:linear-gradient(135deg, rgba(16,16,22,.92), rgba(11,11,16,.66) 55%, rgba(43,76,240,.11)); }
.ccr .mk-head::before { content:""; position:absolute; left:0; right:0; top:0; height:1px; background:linear-gradient(90deg, transparent, rgba(43,76,240,.6), transparent); }
.ccr .mk-eb { display:inline-flex; align-items:center; gap:8px; margin-bottom:12px; border-radius:999px; border:1px solid rgba(43,76,240,.28);
  background:rgba(43,76,240,.11); padding:5px 12px; font-size:10.5px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:rgba(235,232,227,.88); }
.ccr .mk-eb i { width:6px; height:6px; border-radius:50%; background:#3d63ff; box-shadow:0 0 14px rgba(245,158,11,.55); }
.ccr .mk-titles { display:flex; align-items:flex-end; gap:16px; }
.ccr .mk-h1 { font-size:46px; font-weight:700; letter-spacing:-.055em; line-height:1; color:#f2f1ef; white-space:nowrap; }
.ccr .mk-count { display:inline-flex; align-items:center; gap:8px; margin-bottom:4px; border-radius:999px; border:1px solid ${C.border};
  background:rgba(8,8,12,.5); padding:6px 12px; font-size:13.5px; font-weight:600; white-space:nowrap; }
.ccr .mk-count svg { width:16px; height:16px; color:#5b7bff; } .ccr .mk-count span { color:${C.muted}; font-weight:500; }
.ccr .mk-subline { margin-top:9px; font-size:14.5px; color:rgba(140,140,140,.95); }
.ccr .mk-ctrls { margin-left:auto; display:flex; align-items:center; gap:12px; padding:8px; border-radius:22px; border:1px solid ${C.border}; background:rgba(8,8,12,.4); }
.ccr .mk-ds { display:flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px; border:1px solid ${C.border}; background:rgba(8,8,12,.35); white-space:nowrap; }
.ccr .mk-ds svg { width:16px; height:16px; color:#5b7bff; } .ccr .mk-ds .k { font-size:9.5px; font-weight:800; letter-spacing:.18em; color:rgba(140,140,140,.75); }
.ccr .mk-ds b { font-size:13.5px; font-weight:600; }
.ccr .mk-seg { display:flex; gap:4px; padding:4px; border-radius:999px; border:1px solid ${C.border}; background:rgba(255,255,255,.04); }
.ccr .mk-seg span { display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 13px; border-radius:999px; font-size:12px; font-weight:700; color:rgba(140,140,140,.8); }
.ccr .mk-seg span.on { color:${C.fg}; background:#0a0a0d; box-shadow:0 0 0 1px rgba(43,76,240,.3), 0 8px 22px rgba(0,0,0,.3); }
.ccr .mk-seg svg, .ccr .mk-ref svg { width:16px; height:16px; }
.ccr .mk-ref { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px; border-radius:999px; border:1px solid ${C.border}; background:rgba(17,18,22,.85); font-size:13px; font-weight:600; }
.ccr .mk-find { display:flex; flex-direction:column; gap:18px; background:linear-gradient(135deg, rgba(16,16,22,.9), rgba(11,11,16,.6) 60%, rgba(43,76,240,.06)); }
.ccr .mk-searchrow { display:flex; align-items:center; gap:12px; }
.ccr .mk-search { flex:1; height:56px; display:flex; align-items:center; gap:16px; padding:0 20px; border-radius:999px; border:1px solid ${C.border};
  background:rgba(8,8,12,.7); box-shadow:0 14px 36px rgba(0,0,0,.2); font-size:15px; font-weight:500; color:rgba(140,140,140,.7); }
.ccr .mk-search svg { width:20px; height:20px; color:${C.muted}; }
.ccr .mk-filters { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px; border-radius:999px; border:1px solid ${C.border}; background:rgba(8,8,12,.45); font-size:13px; font-weight:600; }
.ccr .mk-filters svg { width:16px; height:16px; }
.ccr .mk-quick { display:flex; gap:12px; padding-top:16px; border-top:1px solid ${C.border}; }
.ccr .mk-quick span { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border-radius:999px; border:1px solid ${C.border};
  background:rgba(8,8,12,.45); font-size:12px; font-weight:600; color:rgba(160,160,160,.95); }
.ccr .mk-quick svg { width:16px; height:16px; } .ccr .mk-quick .lc svg { color:#6f8cff; }
.ccr .mk-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:16px; }
.ccr .mk-card { position:relative; display:flex; flex-direction:column; overflow:hidden; border-radius:16px; border:1px solid ${C.border};
  background:${C.card}; box-shadow:0 10px 30px rgba(0,0,0,.30); }
.ccr .mk-card.sel { border-color:${C.brand}; box-shadow:0 0 0 2px rgba(43,76,240,.30), 0 10px 30px rgba(0,0,0,.30); }
.ccr .mk-glow { position:absolute; inset:0; border-radius:16px; pointer-events:none; opacity:0; z-index:4;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14), inset 0 0 46px rgba(61,99,255,.20); }
.ccr .mk-hero { position:relative; aspect-ratio:4 / 3; overflow:hidden; border-bottom:1px solid rgba(255,255,255,.06); }
.ccr .mk-photo { position:absolute; inset:0; background:#2a3b52 center 45%/cover no-repeat; }
.ccr .mk-cover { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.ccr .mk-cover .mk-dots { position:absolute; inset:0; opacity:.05; background-image:radial-gradient(circle at 1px 1px, ${C.fg} 1px, transparent 0); background-size:16px 16px; }
.ccr .mk-cover svg { position:absolute; width:62%; height:62%; color:rgba(235,232,227,.07); }
.ccr .mk-cover p { position:relative; max-width:85%; font-size:14px; font-weight:600; letter-spacing:-.01em; color:rgba(235,232,227,.6); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ccr .mk-band { position:absolute; left:0; right:0; top:0; display:flex; justify-content:space-between; gap:8px; padding:8px 10px 24px;
  background:linear-gradient(180deg, rgba(235,232,227,.70), rgba(235,232,227,0)); }
.ccr .mk-band b { font-size:11px; font-weight:700; letter-spacing:.06em; color:#0a0a0a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ccr .mk-band span { font-size:11px; font-weight:500; color:rgba(10,10,10,.9); white-space:nowrap; }
.ccr .mk-pres { position:absolute; left:8px; top:36px; display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px;
  font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; box-shadow:0 4px 10px rgba(0,0,0,.25); }
.ccr .mk-pres i { width:8px; height:8px; border-radius:50%; background:currentColor; opacity:.9; }
.ccr .mk-pill { position:absolute; display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:999px; font-size:10px; font-weight:700;
  letter-spacing:.02em; line-height:1; box-shadow:0 1px 3px rgba(0,0,0,.2); }
.ccr .mk-pill i { width:6px; height:6px; border-radius:50%; }
.ccr .mk-pill.photos { right:8px; top:36px; background:rgba(235,232,227,.7); color:#0a0a0a; }
.ccr .mk-pill.fresh { right:8px; background:rgba(10,10,10,.9); color:${C.fg}; }
.ccr .mk-pill.fresh.new { background:${C.success}; color:#0a0a0a; } .ccr .mk-pill.fresh.new i { background:rgba(10,10,10,.9); }
.ccr .mk-body { flex:1; display:flex; flex-direction:column; gap:8px; padding:14px; }
.ccr .mk-r1 { display:flex; align-items:flex-start; gap:8px; }
.ccr .mk-pa { flex:1; min-width:0; }
.ccr .mk-pa b { display:block; font-size:17px; font-weight:700; line-height:1.2; white-space:nowrap; }
.ccr .mk-pa span { display:block; margin-top:2px; font-size:13px; color:${C.muted}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ccr .mk-more { width:32px; height:32px; flex:none; margin-right:-4px; display:grid; place-items:center; border-radius:999px; color:${C.fg}; }
.ccr .mk-more svg { width:16px; height:16px; }
.ccr .mk-grade { width:40px; height:40px; flex:none; display:grid; place-items:center; border-radius:10px; background:${C.gold}; color:#2a1a00;
  font-size:15px; font-weight:800; letter-spacing:-.01em; box-shadow:0 6px 16px rgba(229,185,58,.28); }
.ccr .mk-spec { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; font-size:13px; font-weight:600; }
.ccr .mk-spec span { display:inline-flex; align-items:center; gap:4px; font-variant-numeric:tabular-nums; }
.ccr .mk-spec svg { width:14px; height:14px; color:${C.muted}; } .ccr .mk-spec .t { color:${C.muted}; font-weight:600; }
.ccr .mk-insp { display:flex; } .ccr .mk-insp span { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:999px;
  border:1px solid rgba(43,76,240,.45); color:#6f8cff; font-size:10px; font-weight:700; line-height:1; }
.ccr .mk-insp svg { width:12px; height:12px; }
.ccr .mk-acts { margin-top:auto; display:flex; gap:6px; padding-top:4px; }
.ccr .mk-email { flex:1; height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border-radius:999px; background:${C.brand};
  color:#fff; font-size:12px; font-weight:700; }
.ccr .mk-email svg, .ccr .mk-phone svg { width:14px; height:14px; }
.ccr .mk-phone { width:40px; height:36px; display:grid; place-items:center; border-radius:999px; border:1px solid ${C.border}; color:${C.fg}; }
`;

function card(l, i) {
  const [presence, bg, ink] = PRESENCE[l.presence];
  const picture = l.target
    ? `<div class="mk-photo" style="${F.asset("P.png") ? `background-image:url('${F.asset("P.png")}')` : ""}"></div>`
    : (() => {
        const [a, b] = WASH[band(l.price)];
        const where = l.locality.replace(/ \d{4}$/, "");
        return `<div class="mk-cover" style="background:linear-gradient(135deg, ${a}, ${b} 50%, ${C.card})"><div class="mk-dots"></div>
          <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="${GLYPH[l.glyph]}"/></svg><p>${where}</p></div>`;
      })();
  const photos = l.photos ? `<span class="mk-pill photos"><i style="background:${C.success}"></i>${l.photos} photos</span>` : "";
  const isNew = l.fresh === "New";
  const fresh = `<span class="mk-pill fresh${isNew ? " new" : ""}" style="${l.photos ? "bottom:8px" : "top:36px"}">${isNew ? "<i></i>" : ""}${l.fresh}</span>`;
  const spec = [
    l.beds ? `<span>${lu("bed")}${l.beds}</span>` : "",
    l.baths ? `<span>${lu("bath")}${l.baths}</span>` : "",
    l.cars ? `<span>${lu("car")}${l.cars}</span>` : "",
    l.land ? `<span>${lu("max")}${l.land} m²</span>` : "",
    `<span class="t">· ${l.type}</span>`,
  ].join("");
  return `<article class="mk-card${l.target ? " target" : ""}" id="mk-card-${i}">
    <div class="mk-hero">${picture}
      <div class="mk-band"><b>${l.agency}</b>${l.contact ? `<span>${l.contact}</span>` : ""}</div>
      <span class="mk-pres" style="background:${bg};color:${ink};border:1px solid ${bg}"><i></i>${presence}</span>${photos}${fresh}</div>
    <div class="mk-body">
      <div class="mk-r1"><div class="mk-pa"><b>${money(l.price)}</b><span>${l.address}, ${l.locality}</span></div>
        ${l.grade ? `<div class="mk-grade" id="mk-grade">${l.grade}</div>` : `<span class="mk-more">${lu("more")}</span>`}</div>
      <div class="mk-spec">${spec}</div>
      ${l.inspect ? `<div class="mk-insp"><span>${lu("calclock")}${l.inspect}</span></div>` : ""}
      <div class="mk-acts"><span class="mk-email">${lu("mail")}Email agent</span><span class="mk-phone">${lu("phone")}</span></div>
    </div><div class="mk-glow"></div></article>`;
}

function page() {
  const head = `<section class="mk-sec mk-head"><div style="min-width:0">
      <div class="mk-eb"><i></i>Property Intelligence</div>
      <div class="mk-titles"><div class="mk-h1">Property Marketplace</div>
        <div class="mk-count">${lu("building")}<b style="font-weight:600">24 of 24</b><span>properties</span></div></div>
      <div class="mk-subline">Off-Market · On Market · Builder Opportunities</div></div>
    <div class="mk-ctrls"><div class="mk-ds">${lu("database")}<span class="k">DATASET</span><b>Property Intake Master</b></div>
      <div class="mk-seg"><span class="on">${lu("grid")}Gallery</span><span>${lu("map")}Map</span></div>
      <span class="mk-ref">${lu("refresh")}Refresh</span></div></section>`;
  const find = `<section class="mk-sec mk-find"><div class="mk-searchrow"><div class="mk-search">${lu("search")}Search properties...</div>
      <span class="mk-filters">${lu("sliders")}Filters</span></div>
    <div class="mk-quick"><span>${lu("calcheck")}Has Inspection</span><span class="lc">${lu("alert")}Low Confidence</span><span>${lu("eyeoff")}Off-Market</span></div></section>`;
  const grid = `<div class="mk-grid">${LISTINGS.map(card).join("")}</div>`;
  return `<style>${CSS}</style><div class="mk">${head}${find}${grid}</div>`;
}

/** The marketplace in the Command Centre's shell: PL-11A-c's page with its sidebar on Property Marketplace. */
function plate() {
  return {
    css: [W, H],
    html: F.plate("PL-11A-c", (html) => {
      const once = (s, re, to, what) => {
        const n = (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) || []).length;
        if (n !== 1) throw new Error(`NEW-MARKETPLACE: ${what} is on PL-11A-c ${n} times, not once`);
        return s.replace(re, to);
      };
      let out = once(html, /<a class="on">((?:(?!<a ).)*?)Overview<\/a>/s, '<a class="">$1Overview</a>', "the Overview link");
      out = once(
        out,
        /<a class="">((?:(?!<a ).)*?)Property Marketplace<\/a>/s,
        '<a class="on">$1Property Marketplace</a>',
        "the Property Marketplace link",
      );
      // The page itself, where the Overview's was (the stage's column, before the agent's emblem).
      const open = '<div class="col plain">';
      const from = out.indexOf(open);
      const to = out.indexOf('<div class="qfab">', from);
      if (from < 0 || to < 0 || out.indexOf(open, from + 1) >= 0)
        throw new Error("NEW-MARKETPLACE: PL-11A-c's column is not where it was");
      const close = out.lastIndexOf("</div>", to);
      return `${out.slice(0, from + open.length)}${page()}${out.slice(close)}`;
    }).html,
  };
}

module.exports = { plate, LISTINGS, TARGET, W, H };
