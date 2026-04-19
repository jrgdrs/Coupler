#!/usr/bin/env node
/**
 * font-margins.js
 *
 * Berechnet für jeden Font in ./fonts:
 *   1. Seitliche Abstände (Margins) jedes Zeichens in N Höhenzonen
 *      → ./margins/<fontname>.json
 *   2. Konturabstand jedes Zeichenpaares pro Höhenzone
 *      → ./pairs/<fontname>.json
 *   3. Kerning-Korrekturwerte relativ zum Basiswert "n"+"n"
 *      → ./kerning/<fontname>.csv   Format: "A;B;-22 (z0:val,z2:val,...)"
 *
 * Berechnung Kerning-Mittelwert für ein Paar (A, B):
 *   - Pro Zone z: Zonenwert = right_A[z] + left_B[z]
 *   - Eine Zone ist NUR gültig wenn right_A[z] ≠ -1 UND left_B[z] ≠ -1
 *   - Durchschnitt = Summe der gültigen Zonenwerte / Anzahl gültiger Zonen
 *   - Korrektur = round(paarDurchschnitt − basisDurchschnitt)
 *
 * Verwendung:
 *   node font-margins.js [zonen]
 *
 * Abhängigkeit:
 *   npm install opentype.js
 */

const fs       = require("fs");
const path     = require("path");
const opentype = require("opentype.js");

// ─── Konfiguration ────────────────────────────────────────────────────────────

const FONTS_DIR   = path.resolve("./fonts");
const MARGINS_DIR = path.resolve("./margins");
const PAIRS_DIR   = path.resolve("./pairs");
const KERNING_DIR = path.resolve("./kerning");
const ZONES        = parseInt(process.argv[2] ?? "9",   10);
const SMOOTH_PCT   = parseFloat(process.argv[3] ?? "40") / 100;  // z.B. 0.40 = 40%
const KERN_ROUND   = parseInt(process.argv[4] ?? "1",   10);     // Rundungsmodul, 1 = keine Rundung
const SUPERSAMPLE  = parseInt(process.argv[5] ?? "10",  10);     // Subzonen pro Zone für Kantenglättung
// Referenzzeichen für Basiswerte
const BASELINE_LC  = "n";   // Kleinbuchstaben & OSF-Ziffern   → n+n
const BASELINE_UC1 = "O";   // Großbuchstaben & Lining-Ziffern → O+O

if (isNaN(ZONES) || ZONES < 1) {
  console.error("Fehler: Zonenanzahl muss eine positive Ganzzahl sein.");
  process.exit(1);
}
if (isNaN(KERN_ROUND) || KERN_ROUND < 1) {
  console.error("Fehler: Rundungsmodul muss eine positive Ganzzahl sein.");
  process.exit(1);
}
if (isNaN(SUPERSAMPLE) || SUPERSAMPLE < 1) {
  console.error("Fehler: Skalierungsfaktor muss eine positive Ganzzahl sein.");
  process.exit(1);
}

// ─── PostScript-Glyphnamen (prodnames) ───────────────────────────────────────
// Mapping von Unicode-Hex (4-stellig, Großbuchstaben) → PostScript-Glyphname.
// Quelle: Adobe Glyph List. Wird für die CSV-Ausgabe verwendet, damit
// Zeichen wie "." als "period" statt als Rohzeichen erscheinen.

const PRODNAMES = {"2002":"enspace","2010":"hyphentwo","2012":"figuredash","2013":"endash","2014":"emdash","2015":"horizontalbar","2016":"dblverticalbar","2017":"underscoredbl","2018":"quoteleft","2019":"quoteright","2020":"dagger","2021":"daggerdbl","2022":"bullet","2024":"onedotenleader","2025":"twodotleader","2026":"ellipsis","2030":"perthousand","2032":"minute","2033":"second","2035":"primereversed","2039":"guilsinglleft","2042":"asterism","2044":"fraction","2070":"zerosuperior","2074":"foursuperior","2075":"fivesuperior","2076":"sixsuperior","2077":"sevensuperior","2078":"eightsuperior","2079":"ninesuperior","2080":"zeroinferior","2081":"oneinferior","2082":"twoinferior","2083":"threeinferior","2084":"fourinferior","2085":"fiveinferior","2086":"sixinferior","2087":"seveninferior","2088":"eightinferior","2089":"nineinferior","2103":"centigrade","2105":"careof","2109":"fahrenheit","2111":"Ifraktur","2113":"lsquare","2116":"numero","2118":"weierstrass","2121":"telephone","2122":"trademark","2126":"Omega","2135":"aleph","2153":"onethird","2154":"twothirds","2160":"Oneroman","2161":"Tworoman","2162":"Threeroman","2163":"Fourroman","2164":"Fiveroman","2165":"Sixroman","2166":"Sevenroman","2167":"Eightroman","2168":"Nineroman","2169":"Tenroman","2170":"oneroman","2171":"tworoman","2172":"threeroman","2173":"fourroman","2174":"fiveroman","2175":"sixroman","2176":"sevenroman","2177":"eightroman","2178":"nineroman","2179":"tenroman","2190":"arrowleft","2191":"arrowup","2192":"arrowright","2193":"arrowdown","2194":"arrowboth","2195":"arrowupdn","2196":"arrowupleft","2197":"arrowupright","2198":"arrowdownright","2199":"arrowdownleft","2200":"universal","2202":"partialdiff","2203":"thereexists","2205":"emptyset","2206":"increment","2207":"nabla","2208":"element","2209":"notelementof","2211":"summation","2212":"minus","2213":"minusplus","2215":"divisionslash","2217":"asteriskmath","2219":"bulletoperator","2220":"angle","2223":"divides","2225":"parallel","2226":"notparallel","2227":"logicaland","2228":"logicalor","2229":"intersection","2234":"therefore","2235":"because","2236":"ratio","2237":"proportion","2243":"asymptoticallyequal","2245":"congruent","2248":"approxequal","2250":"approaches","2251":"geometricallyequal","2252":"approxequalorimage","2253":"imageorapproximatelyequal","2260":"notequal","2261":"equivalence","2262":"notidentical","2264":"lessequal","2265":"greaterequal","2266":"lessoverequal","2267":"greateroverequal","2270":"notlessnorequal","2271":"notgreaternorequal","2272":"lessorequivalent","2273":"greaterorequivalent","2276":"lessorgreater","2277":"greaterorless","2279":"notgreaternorless","2280":"notprecedes","2281":"notsucceeds","2282":"subset","2283":"superset","2284":"notsubset","2285":"notsuperset","2286":"subsetorequal","2287":"supersetorequal","2295":"pluscircle","2296":"minuscircle","2297":"timescircle","2299":"circleot","2302":"house","2303":"control","2305":"projective","2310":"revlogicalnot","2312":"arc","2318":"propellor","2320":"integraltp","2321":"integralbt","2325":"option","2326":"deleteright","2327":"clear","2329":"angleleft","2423":"blank","2460":"onecircle","2461":"twocircle","2462":"threecircle","2463":"fourcircle","2464":"fivecircle","2465":"sixcircle","2466":"sevencircle","2467":"eightcircle","2468":"ninecircle","2469":"tencircle","F724":"dollaroldstyle","F730":"zerooldstyle","F731":"oneoldstyle","F732":"twooldstyle","F733":"threeoldstyle","F734":"fouroldstyle","F735":"fiveoldstyle","F736":"sixoldstyle","F737":"sevenoldstyle","F738":"eightoldstyle","F739":"nineoldstyle","F6BE":"dotlessj","F6C3":"commaaccent","F6DC":"onefitted","F6DD":"rupiah","F6DE":"threequartersemdash","F6DF":"centinferior","F6E0":"centsuperior","F6E1":"commainferior","F6E2":"commasuperior","F6E3":"dollarinferior","F6E4":"dollarsuperior","F6E5":"hypheninferior","F6E6":"hyphensuperior","F6E7":"periodinferior","F6E8":"periodsuperior","F6E9":"asuperior","F6EA":"bsuperior","F6EB":"dsuperior","F6EC":"esuperior","F6ED":"isuperior","F6EE":"lsuperior","F6EF":"msuperior","F6F0":"osuperior","F6F1":"rsuperior","F6F2":"ssuperior","F6F3":"tsuperior","FB00":"ff","FB01":"fi","FB02":"fl","FB03":"ffi","FB04":"ffl","20AC":"euro","0021":"exclam","0022":"quotedbl","0023":"numbersign","0024":"dollar","0025":"percent","0026":"ampersand","0027":"quotesingle","0028":"parenleft","0029":"parenright","002A":"asterisk","002B":"plus","002C":"comma","002D":"hyphen","002E":"period","002F":"slash","0030":"zero","0031":"one","0032":"two","0033":"three","0034":"four","0035":"five","0036":"six","0037":"seven","0038":"eight","0039":"nine","003A":"colon","003B":"semicolon","003C":"less","003D":"equal","003E":"greater","003F":"question","0040":"at","0041":"A","0042":"B","0043":"C","0044":"D","0045":"E","0046":"F","0047":"G","0048":"H","0049":"I","004A":"J","004B":"K","004C":"L","004D":"M","004E":"N","004F":"O","0050":"P","0051":"Q","0052":"R","0053":"S","0054":"T","0055":"U","0056":"V","0057":"W","0058":"X","0059":"Y","005A":"Z","005B":"bracketleft","005C":"backslash","005D":"bracketright","005E":"asciicircum","005F":"underscore","0060":"grave","0061":"a","0062":"b","0063":"c","0064":"d","0065":"e","0066":"f","0067":"g","0068":"h","0069":"i","006A":"j","006B":"k","006C":"l","006D":"m","006E":"n","006F":"o","0070":"p","0071":"q","0072":"r","0073":"s","0074":"t","0075":"u","0076":"v","0077":"w","0078":"x","0079":"y","007A":"z","007B":"braceleft","007C":"verticalbar","007D":"braceright","007E":"asciitilde","00A0":"nonbreakingspace","00A1":"exclamdown","00A2":"cent","00A3":"sterling","00A4":"currency","00A5":"yen","00A6":"brokenbar","00A7":"section","00A8":"dieresis","00A9":"copyright","00AA":"ordfeminine","00AB":"guillemotleft","00AC":"logicalnot","00AD":"softhyphen","00AE":"registered","00AF":"overscore","00B0":"degree","00B1":"plusminus","00B2":"twosuperior","00B3":"threesuperior","00B4":"acute","00B5":"mu1","00B6":"paragraph","00B7":"periodcentered","00B8":"cedilla","00B9":"onesuperior","00BA":"ordmasculine","00BB":"guillemotright","00BC":"onequarter","00BD":"onehalf","00BE":"threequarters","00BF":"questiondown","00C0":"Agrave","00C1":"Aacute","00C2":"Acircumflex","00C3":"Atilde","00C4":"Adieresis","00C5":"Aring","00C6":"AE","00C7":"Ccedilla","00C8":"Egrave","00C9":"Eacute","00CA":"Ecircumflex","00CB":"Edieresis","00CC":"Igrave","00CD":"Iacute","00CE":"Icircumflex","00CF":"Idieresis","00D0":"Eth","00D1":"Ntilde","00D2":"Ograve","00D3":"Oacute","00D4":"Ocircumflex","00D5":"Otilde","00D6":"Odieresis","00D7":"multiply","00D8":"Oslash","00D9":"Ugrave","00DA":"Uacute","00DB":"Ucircumflex","00DC":"Udieresis","00DD":"Yacute","00DE":"Thorn","00DF":"germandbls","00E0":"agrave","00E1":"aacute","00E2":"acircumflex","00E3":"atilde","00E4":"adieresis","00E5":"aring","00E6":"ae","00E7":"ccedilla","00E8":"egrave","00E9":"eacute","00EA":"ecircumflex","00EB":"edieresis","00EC":"igrave","00ED":"iacute","00EE":"icircumflex","00EF":"idieresis","00F0":"eth","00F1":"ntilde","00F2":"ograve","00F3":"oacute","00F4":"ocircumflex","00F5":"otilde","00F6":"odieresis","00F7":"divide","00F8":"oslash","00F9":"ugrave","00FA":"uacute","00FB":"ucircumflex","00FC":"udieresis","00FD":"yacute","00FE":"thorn","00FF":"ydieresis","0100":"Amacron","0101":"amacron","0102":"Abreve","0103":"abreve","0104":"Aogonek","0105":"aogonek","0106":"Cacute","0107":"cacute","0108":"Ccircumflex","0109":"ccircumflex","010A":"Cdotaccent","010B":"cdotaccent","010C":"Ccaron","010D":"ccaron","010E":"Dcaron","010F":"dcaron","0110":"Dslash","0111":"dmacron","0112":"Emacron","0113":"emacron","0114":"Ebreve","0115":"ebreve","0116":"Edotaccent","0117":"edotaccent","0118":"Eogonek","0119":"eogonek","011A":"Ecaron","011B":"ecaron","011C":"Gcircumflex","011D":"gcircumflex","011E":"Gbreve","011F":"gbreve","0131":"dotlessi","0141":"Lslash","0142":"lslash","0152":"OE","0153":"oe","0160":"Scaron","0161":"scaron","0178":"Ydieresis","017D":"Zcaron","017E":"zcaron","0192":"florin","02C6":"circumflex","02C7":"caron","02D8":"breve","02D9":"dotaccent","02DA":"ring","02DB":"ogonek","02DC":"tilde","02DD":"hungarumlaut","2018":"quoteleft","2019":"quoteright","201A":"quotesinglbase","201C":"quotedblleft","201D":"quotedblright","201E":"quotedblbase","2022":"bullet","2026":"ellipsis","2039":"guilsinglleft","203A":"guilsinglright","2044":"fraction","FB01":"fi","FB02":"fl"};

/**
 * Ermittelt den bevorzugten Label-String für ein Zeichen in der CSV-Ausgabe.
 * Priorität:
 *   1. prodnames-Eintrag für den Unicode-Codepunkt
 *   2. opentype-Glyphname aus dem Font (falls sinnvoll, d.h. nicht generisch)
 *   3. Rohzeichen (String.fromCodePoint)
 *   4. Glyph-Key als Fallback
 *
 * @param {number|null} unicode
 * @param {string}      opentypeGlyphName
 * @param {string}      glyphKey
 * @returns {string}
 */
function resolveCharLabel(unicode, opentypeGlyphName, glyphKey) {
  if (unicode !== null) {
    // 1. prodnames-Lookup
    const hexKey = unicode.toString(16).toUpperCase().padStart(4, "0");
    if (PRODNAMES[hexKey]) return PRODNAMES[hexKey];

    // 2. opentype-Glyphname falls vorhanden und nicht generisch (kein "glyph123")
    if (opentypeGlyphName && !/^glyph\d+$/i.test(opentypeGlyphName)) {
      return opentypeGlyphName;
    }

    // 3. Rohzeichen
    try { return String.fromCodePoint(unicode); } catch (_) {}
  }

  // 4. Glyph-Key
  return glyphKey;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function round1(v)   { return Math.round(v * 10) / 10; }
function roundInt(v) { return Math.round(v); }

// ─── Bézier-Auswertung ────────────────────────────────────────────────────────

function cubicXY(p0, p1, p2, p3, t) {
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2*mt*p0.x + 3*mt2*t*p1.x + 3*mt*t2*p2.x + t2*t*p3.x,
    y: mt2*mt*p0.y + 3*mt2*t*p1.y + 3*mt*t2*p2.y + t2*t*p3.y,
  };
}

function quadXY(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt*mt*p0.x + 2*mt*t*p1.x + t*t*p2.x,
    y: mt*mt*p0.y + 2*mt*t*p1.y + t*t*p2.y,
  };
}

/**
 * Findet per Bisektion alle t-Werte einer Bézier-Kurve, bei denen y(t) = yTarget.
 * Arbeitet rekursiv auf dem Intervall [t0, t1] und teilt solange auf, bis
 * die y-Spanne des Teilintervalls kleiner als BISECT_EPS ist.
 *
 * Dadurch werden auch Kurven mit mehreren Nulldurchgängen korrekt erfasst.
 */
const BISECT_EPS = 0.05;   // t-Intervall-Mindestbreite für Rekursion
const BISECT_Y_EPS = 0.01; // y-Toleranz für Konvergenz

function bisectCurve(yFn, xFn, yTarget, t0, t1, results) {
  const y0 = yFn(t0);
  const y1 = yFn(t1);

  // Kein Vorzeichenwechsel und Intervall klein genug → kein Schnittpunkt hier
  if ((y0 - yTarget) * (y1 - yTarget) > 0) {
    // Aber nur überspringen wenn Intervall schmal genug
    if ((t1 - t0) < BISECT_EPS) return;
    // Ansonsten trotzdem aufteilen (Kurve könnte in der Mitte die Grenze berühren)
  }

  if (t1 - t0 < BISECT_EPS) {
    // Konvergiert: Mittelpunkt als Ergebnis
    if (Math.abs(y0 - yTarget) < Math.abs(y1 - yTarget)) {
      results.push(xFn(t0));
    } else {
      results.push(xFn(t1));
    }
    return;
  }

  const tMid = (t0 + t1) / 2;
  bisectCurve(yFn, xFn, yTarget, t0,   tMid, results);
  bisectCurve(yFn, xFn, yTarget, tMid, t1,   results);
}

/**
 * Gibt für ein Kurven-Segment alle x-Werte zurück, bei denen die Kurve
 * die horizontale Linie y = yTarget schneidet (in Font-Koordinaten, Y-oben).
 *
 * Zusätzlich werden alle Punkte im Inneren des Intervalls [yMin, yMax]
 * durch dichtes Sampling erfasst (für das x-Extremum innerhalb der Zone).
 */
function segmentXAtY(xyFn, yTarget, DENSE_SAMPLES = 128) {
  const xs = [];
  bisectCurve(
    t => xyFn(t).y,
    t => xyFn(t).x,
    yTarget, 0, 1, xs
  );
  return xs;
}

/**
 * Berechnet das x-Minimum und x-Maximum einer Kurve innerhalb des
 * y-Intervalls [yLo, yHi] (Font-Koordinaten, Y-oben).
 *
 * Strategie:
 *   1. Dichtes Sampling innerhalb der Zone → x-Extrema der Stützpunkte
 *   2. Schnittpunkte mit den Zonengrenzen yLo und yHi → x-Werte an den Rändern
 *
 * Das dichte Sampling stellt sicher, dass auch Kurven, die die Zone nur
 * streifen oder vollständig darin liegen, korrekt erfasst werden.
 */
const DENSE_SAMPLES = 512;  // Samples pro Segment für das Innere der Zone

function segmentXRangeInZone(xyFn, yLo, yHi) {
  let xMin = Infinity, xMax = -Infinity;

  // 1. Dichtes Sampling: alle Punkte im y-Intervall
  for (let i = 0; i <= DENSE_SAMPLES; i++) {
    const t  = i / DENSE_SAMPLES;
    const pt = xyFn(t);
    if (pt.y >= yLo && pt.y <= yHi) {
      if (pt.x < xMin) xMin = pt.x;
      if (pt.x > xMax) xMax = pt.x;
    }
  }

  // 2. Schnittpunkte mit den Zonengrenzen (Bisektion für Genauigkeit)
  for (const yBound of [yLo, yHi]) {
    const xs = segmentXAtY(xyFn, yBound);
    for (const x of xs) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }

  if (!isFinite(xMin)) return null;
  return { xMin, xMax };
}

/**
 * Zerlegt den opentype-Pfad in Segmente und berechnet für jede Zone
 * das x-Minimum und x-Maximum über ALLE Segmente.
 *
 * opentype.js liefert Y nach unten → wir invertieren zu Y nach oben
 * (fontY = -opentypeY), damit Zone 0 am Schriftfuß liegt.
 *
 * @param {object} opentypePath  Pfad aus glyph.getPath(0, 0, upm)
 * @param {number} zones         Anzahl Höhenzonen
 * @param {number} yBottom       untere Zonengrenze in Font-Koordinaten (Y-oben)
 * @param {number} yTop          obere  Zonengrenze in Font-Koordinaten (Y-oben)
 * @returns {{ xMin: number, xMax: number }[]}  Array der Länge `zones`,
 *          Einträge sind null wenn keine Kontur in der Zone liegt.
 */
function pathXRangesPerZone(opentypePath, zones, yBottom, yTop) {
  const zoneHeight = (yTop - yBottom) / zones;

  // Zonenresultate initialisieren
  const zoneXMin = new Float64Array(zones).fill(Infinity);
  const zoneXMax = new Float64Array(zones).fill(-Infinity);

  let cx = 0, cy = 0, sx = 0, sy = 0;

  // Hilfsfunktion: aktualisiert alle Zonen, die ein Segment berührt
  function processSegment(xyFn) {
    // Bounding-Box des Segments in Y ermitteln (über Sampling)
    let segYMin = Infinity, segYMax = -Infinity;
    for (let i = 0; i <= 32; i++) {
      const y = -xyFn(i / 32).y;   // in Font-Y (oben)
      if (y < segYMin) segYMin = y;
      if (y > segYMax) segYMax = y;
    }

    // Nur Zonen prüfen, die sich mit dem Segment überschneiden
    const zStart = Math.max(0,       Math.floor((segYMin - yBottom) / zoneHeight));
    const zEnd   = Math.min(zones-1, Math.ceil ((segYMax - yBottom) / zoneHeight));

    // Wrapper der Y-Achse invertiert
    const xyFnUp = t => { const p = xyFn(t); return { x: p.x, y: -p.y }; };

    for (let z = zStart; z <= zEnd; z++) {
      const zLo = yBottom + z * zoneHeight;
      const zHi = zLo + zoneHeight;
      const range = segmentXRangeInZone(xyFnUp, zLo, zHi);
      if (range) {
        if (range.xMin < zoneXMin[z]) zoneXMin[z] = range.xMin;
        if (range.xMax > zoneXMax[z]) zoneXMax[z] = range.xMax;
      }
    }
  }

  for (const cmd of opentypePath.commands) {
    switch (cmd.type) {
      case "M":
        cx = cmd.x; cy = cmd.y; sx = cx; sy = cy;
        break;
      case "L": {
        const x0=cx, y0=cy, x1=cmd.x, y1=cmd.y;
        processSegment(t => ({ x: x0 + t*(x1-x0), y: y0 + t*(y1-y0) }));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case "Q": {
        const p0={x:cx,y:cy}, p1={x:cmd.x1,y:cmd.y1}, p2={x:cmd.x,y:cmd.y};
        processSegment(t => quadXY(p0, p1, p2, t));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case "C": {
        const p0={x:cx,y:cy}, p1={x:cmd.x1,y:cmd.y1}, p2={x:cmd.x2,y:cmd.y2}, p3={x:cmd.x,y:cmd.y};
        processSegment(t => cubicXY(p0, p1, p2, p3, t));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case "Z":
        if (cx !== sx || cy !== sy) {
          const x0=cx, y0=cy, x1=sx, y1=sy;
          processSegment(t => ({ x: x0 + t*(x1-x0), y: y0 + t*(y1-y0) }));
        }
        cx = sx; cy = sy;
        break;
    }
  }

  // Ergebnisse zusammenstellen
  return Array.from({ length: zones }, (_, z) =>
    isFinite(zoneXMin[z]) ? { xMin: zoneXMin[z], xMax: zoneXMax[z] } : null
  );
}

/**
 * Kaufmännische Rundung auf ein Modul (z.B. 46 → nächstes Vielfaches von 46).
 * roundToModule(137, 46) → 138  (= 3 × 46)
 * roundToModule(-91, 46) → -92  (= -2 × 46)
 */
function roundToModule(value, mod) {
  if (mod <= 1) return Math.round(value);
  return Math.round(value / mod) * mod;
}

/**
 * Glättet ein Margin-Array ausgehend vom Anker (Zone mit minimalem gültigem
 * Wert = maximale Ausdehnung des Zeichens in diese Richtung).
 *
 * Regeln:
 *   - Der Ankerwert bleibt UNVERÄNDERT — er ist die maximale Ausdehnung.
 *   - Von der Ankerzone aus wird nach oben UND nach unten geglättet.
 *   - Jede Zone darf vom direkten Nachbarn Richtung Anker maximal um
 *     smoothPct × zoneHeight abweichen.
 *   - Werte dürfen nie UNTER den Ankerwert fallen (Kontur kann nicht weiter
 *     nach außen reichen als die maximale Ausdehnung).
 *   - Ungültige Zonen (-1) bleiben unverändert und unterbrechen die Kette
 *     nicht — die nächste gültige Zone wird als Nachbar verwendet.
 *
 * Beispiel links (kleinerer Wert = weiter links = mehr Ausdehnung):
 *   Rohwerte:    [18, 4, 20, 22, 8, 16]   (Anker: z=1 mit Wert 4)
 *   Glättung:    [11, 4,  11, 18, 8, 14]  (von Anker aus nach außen begrenzt)
 *
 * @param {number[]} arr         Rohwerte (left oder right), -1 = ungültig
 * @param {number}   zoneHeight  Höhe einer Zone in Font-Units
 * @param {number}   smoothPct   Maximaler Anteil der Zonenhöhe als Δ (z.B. 0.70)
 * @returns {number[]}           Geglättete Werte (gleiche Länge, -1 bleibt -1)
 */
function smoothMargins(arr, zoneHeight, smoothPct) {
  const maxDelta = smoothPct * zoneHeight;
  const n   = arr.length;
  const out = arr.slice();

  // Anker: Zone mit dem kleinsten gültigen Wert (= maximale Ausdehnung)
  let anchorZ   = -1;
  let anchorVal = Infinity;
  for (let z = 0; z < n; z++) {
    if (arr[z] !== -1 && arr[z] < anchorVal) {
      anchorVal = arr[z];
      anchorZ   = z;
    }
  }

  // Kein gültiger Wert → nichts zu glätten
  if (anchorZ === -1) return out;

  // Hilfsfunktion: nächster gültiger Nachbar in Richtung `step` (+1 oder -1)
  function nextValid(from, step) {
    let z = from + step;
    while (z >= 0 && z < n) {
      if (out[z] !== -1) return z;
      z += step;
    }
    return -1;
  }

  // ── Von Anker nach UNTEN glätten (z = anchorZ-1 → 0) ──────────────────────
  // Jede Zone darf maximal maxDelta ÜBER ihrem Nachfolger Richtung Anker liegen.
  // "Über" bedeutet hier: größerer Wert (= weniger Ausdehnung).
  // Unter den Ankerwert darf kein Wert fallen.
  let prev = anchorZ;
  for (let z = anchorZ - 1; z >= 0; z--) {
    if (out[z] === -1) continue;
    const ref = out[prev];                          // Nachbar Richtung Anker
    const maxAllowed = round1(ref + maxDelta);      // darf nicht mehr als das sein
    if (out[z] > maxAllowed) out[z] = maxAllowed;
    // Nie unter Ankerwert (Kontur kann nicht weiter als Maximum reichen)
    if (out[z] < anchorVal) out[z] = round1(anchorVal);
    prev = z;
  }

  // ── Von Anker nach OBEN glätten (z = anchorZ+1 → n-1) ────────────────────
  prev = anchorZ;
  for (let z = anchorZ + 1; z < n; z++) {
    if (out[z] === -1) continue;
    const ref = out[prev];
    const maxAllowed = round1(ref + maxDelta);
    if (out[z] > maxAllowed) out[z] = maxAllowed;
    if (out[z] < anchorVal) out[z] = round1(anchorVal);
    prev = z;
  }

  return out;
}

/**
 * Berechnet left[] und right[] Margin-Arrays für ein Glyph.
 * Y invertiert: Zone 0 = Schriftfuß, Zone N-1 = Kopf.
 * Verwendet analytische Segment-Zonenschnitte statt Punkt-Sampling.
 */
function computeGlyphMargins(glyph, upm, zones, yBottom, yTop) {
  const advanceWidth = glyph.advanceWidth ?? 0;
  const zoneHeight   = (yTop - yBottom) / zones;
  const rawPath      = glyph.getPath(0, 0, upm);
  const zoneRanges   = pathXRangesPerZone(rawPath, zones, yBottom, yTop);

  // ── Rohwerte ────────────────────────────────────────────────────────────────
  const leftRaw = [], rightRaw = [];

  for (let z = 0; z < zones; z++) {
    const range = zoneRanges[z];
    if (!range) {
      leftRaw.push(-1);
      rightRaw.push(-1);
    } else {
      leftRaw.push(round1(range.xMin));
      rightRaw.push(round1(advanceWidth - range.xMax));
    }
  }

  // ── Gewichtete (geglättete) Werte ───────────────────────────────────────────
  // Glättung sorgt dafür dass benachbarte Zonen maximal SMOOTH_PCT × zoneHeight
  // voneinander abweichen. Basis: maximale Ausdehnung = minimaler Margin-Wert.
  const leftSmoothed  = smoothMargins(leftRaw,  zoneHeight, SMOOTH_PCT);
  const rightSmoothed = smoothMargins(rightRaw, zoneHeight, SMOOTH_PCT);

  let unicode = null;
  if (glyph.unicodes?.length > 0) unicode = glyph.unicodes[0];

  return {
    left:             leftSmoothed,   // gewichtete Werte (für pairs & kerning)
    right:            rightSmoothed,
    leftUnweighted:   leftRaw,        // Rohwerte (zur Information / Debug)
    rightUnweighted:  rightRaw,
    advanceWidth,
    unicode,
  };
}

// ─── Paar-Gap pro Zone ────────────────────────────────────────────────────────

/**
 * Berechnet gap[z] = right_A[z] + left_B[z] für jede Zone.
 * Ist einer der beiden Werte -1, ist die Zone UNGÜLTIG → gap[z] = -1.
 * (Für pairs.json – streng: nur beide gültig ergibt einen Wert.)
 */
function computePairGaps(rightA, leftB) {
  return rightA.map((rA, z) => {
    const lB = leftB[z];
    if (rA === -1 || lB === -1) return -1;   // streng: BEIDE müssen gültig sein
    return round1(rA + lB);
  });
}

// ─── Mittelwert & Kontrollwerte ───────────────────────────────────────────────

/**
 * Berechnet den Durchschnitt eines Paares über alle Zonen,
 * in denen BEIDE Seiten gültig sind (≠ -1).
 *
 * Rückgabe:
 *   {
 *     mean:        Durchschnittswert (Summe / Anzahl gültiger Zonen),
 *     validCount:  Anzahl berücksichtigter Zonen,
 *     zoneValues:  Array der gültigen Einzelwerte mit Index,
 *                  z.B. [{z:1, rA:45.2, lB:38.1, sum:83.3}, ...]
 *   }
 *   oder null wenn keine gültige Zone vorhanden.
 *
 * @param {number[]} rightA  right-Margin-Array von Zeichen A
 * @param {number[]} leftB   left-Margin-Array von Zeichen B
 */
function pairMean(rightA, leftB) {
  const zoneValues = [];
  let sum = 0;

  for (let z = 0; z < rightA.length; z++) {
    const rA = rightA[z];
    const lB = leftB[z];

    // Zone nur gültig wenn BEIDE Seiten einen echten Wert haben
    if (rA === -1 || lB === -1) continue;

    const zoneSum = rA + lB;
    sum += zoneSum;
    zoneValues.push({ z, rA, lB, sum: round1(zoneSum) });
  }

  if (zoneValues.length === 0) return null;

  return {
    mean:       sum / zoneValues.length,
    validCount: zoneValues.length,
    zoneValues,
  };
}

// ─── Zeichenklassifizierung ───────────────────────────────────────────────────

/**
 * Bestimmt ob ein Glyph zum Großbuchstaben/Lining-Ziffern-Bereich gehört
 * (→ UC-Basiswert N+O) oder zum Kleinbuchstaben/OSF-Bereich (→ LC-Basiswert n+n).
 *
 * Klassifizierung nach Unicode:
 *   UC: A–Z (65–90), Lining-Ziffern 0–9 (48–57),
 *       lateinische Großbuchstaben mit Diakritika (192–221, 223 ausgenommen),
 *       weitere Großbuchstaben-Blöcke (z.B. Ä Ö Ü etc.)
 *   LC: alles andere (a–z, OSF-Ziffern, Sonderzeichen, …)
 *
 * Bei unbekanntem Unicode oder fehlendem Unicode → LC (konservativer Fallback).
 *
 * @param {number|null} unicode  Unicode-Codepunkt des Glyphs
 * @param {string}      glyphName
 * @returns {"UC"|"LC"}
 */
function classifyGlyph(unicode, glyphName) {
  if (unicode === null) {
    // Versuch über Glyph-Namen: Großbuchstaben haben oft Namen wie "A", "Adieresis" etc.
    if (glyphName && /^[A-Z]/.test(glyphName)) return "UC";
    return "LC";
  }

  // Lining-Ziffern 0–9
  if (unicode >= 48 && unicode <= 57) return "UC";

  // Lateinische Großbuchstaben A–Z
  if (unicode >= 65 && unicode <= 90) return "UC";

  // Lateinisch-1-Ergänzung: Großbuchstaben (À–Ö = 192–214, Ø–Þ = 216–222)
  if ((unicode >= 192 && unicode <= 214) ||
      (unicode >= 216 && unicode <= 222)) return "UC";

  // Lateinisch Erweitert-A: Großbuchstaben (gerade Codepunkte im Bereich 256–310 etc.)
  // Grobe Näherung: Buchstaben im Bereich 256–382 mit geradem Codepunkt sind meist Groß
  if (unicode >= 256 && unicode <= 382 && unicode % 2 === 0) return "UC";

  // Griechische Großbuchstaben
  if (unicode >= 0x0391 && unicode <= 0x03A9) return "UC";

  // Kyrillische Großbuchstaben
  if (unicode >= 0x0410 && unicode <= 0x042F) return "UC";

  return "LC";
}

// ─── Font verarbeiten ─────────────────────────────────────────────────────────

async function processFont(fontPath) {
  console.log(`  Lade: ${path.basename(fontPath)}`);
  const font = opentype.loadSync(fontPath);
  const upm  = font.unitsPerEm;

  let yBottom = -(upm * 0.2);
  let yTop    =   upm * 0.8;

  if (font.tables?.os2) {
    const { sTypoDescender, sTypoAscender } = font.tables.os2;
    if (sTypoDescender !== undefined) yBottom = sTypoDescender;
    if (sTypoAscender  !== undefined) yTop    = sTypoAscender;
  } else if (font.tables?.hhea) {
    const { descender, ascender } = font.tables.hhea;
    if (descender !== undefined) yBottom = descender;
    if (ascender  !== undefined) yTop    = ascender;
  }

  const zoneHeight = (yTop - yBottom) / ZONES;

  const sharedMeta = {
    fontName:   font.names?.fullName?.en ?? path.basename(fontPath),
    file:       path.basename(fontPath),
    upm,
    zones:      ZONES,
    zoneHeight: round1(zoneHeight),
    yBottom:    round1(yBottom),
    yTop:       round1(yTop),
  };

  // ── 1. Margins pro Glyph ────────────────────────────────────────────────────

  const marginsResult    = { meta: sharedMeta, glyphs: {} };
  const glyphCache       = {};   // glyphKey → { left, right, charLabel }

  for (const key of Object.keys(font.glyphs.glyphs)) {
    const glyph = font.glyphs.glyphs[key];
    if (!glyph.path || glyph.path.commands.length === 0) continue;

    const { left, right, leftUnweighted, rightUnweighted, advanceWidth, unicode } =
      computeGlyphMargins(glyph, upm, ZONES, yBottom, yTop);

    const glyphKey  = glyph.name ?? `glyph_${key}`;
    const charLabel = resolveCharLabel(unicode, glyph.name, glyphKey);

    marginsResult.glyphs[glyphKey] = {
      name:             glyph.name ?? glyphKey,
      unicode,
      unicodeHex:       unicode !== null
                          ? `U+${unicode.toString(16).toUpperCase().padStart(4, "0")}`
                          : null,
      char:             charLabel,
      advanceWidth,
      left,              // gewichtete (geglättete) Werte
      right,
      leftUnweighted,    // Rohwerte zur Information / Debugging
      rightUnweighted,
    };

    glyphCache[glyphKey] = { left, right, charLabel, unicode,
                              glyphName: glyph.name ?? glyphKey };
  }

  // ── 2. Basiswerte ermitteln ──────────────────────────────────────────────────

  // LC-Basiswert: n + n
  const nData    = glyphCache[BASELINE_LC];
  const baseCalcLC = nData ? pairMean(nData.right, nData.left) : null;

  if (!baseCalcLC) {
    console.warn(`  ⚠ Kein LC-Basiswert ("${BASELINE_LC}"+"${BASELINE_LC}") – Kerning übersprungen.`);
    return { marginsResult, pairsResult: null, kerningLines: null, baseValueLC: null, baseValueUC: null };
  }

  // UC-Basiswert: O + O
  const nUC1 = glyphCache[BASELINE_UC1];   // "O"
  const baseCalcUC1 = nUC1 ? pairMean(nUC1.right, nUC1.left) : null;

  let baseValueUC = null;
  let baseUCNote  = "";

  if (baseCalcUC1) {
    baseValueUC = baseCalcUC1.mean;
    baseUCNote  = `Ø ${round1(baseValueUC)} (${baseCalcUC1.validCount} Zonen: ${baseCalcUC1.zoneValues.map(v=>`z${v.z}:${v.sum}`).join(",")})`;
  } else {
    // Fallback: UC-Basiswert = LC-Basiswert
    baseValueUC = baseCalcLC.mean;
    baseUCNote  = `Fallback auf LC-Basiswert ("O" nicht gefunden)`;
  }

  const baseValueLC = baseCalcLC.mean;

  const baseZoneStrLC = baseCalcLC.zoneValues.map(v => `z${v.z}:${v.sum}`).join(",");
  console.log(`     Basiswert LC "${BASELINE_LC}"+"${BASELINE_LC}": Ø ${round1(baseValueLC)} (${baseCalcLC.validCount} Zonen: ${baseZoneStrLC})`);
  console.log(`     Basiswert UC "${BASELINE_UC1}"+"${BASELINE_UC1}": ${baseUCNote}`);

  // ── 3. Paare + Kerning ──────────────────────────────────────────────────────

  const glyphKeys  = Object.keys(glyphCache);
  const glyphCount = glyphKeys.length;
  const pairCount  = glyphCount * glyphCount;

  console.log(`     ${glyphCount} Zeichen → ${pairCount.toLocaleString()} Paare …`);

  const pairsResult = {
    meta: {
      ...sharedMeta,
      glyphCount,
      pairCount,
      baseValueLC: round1(baseValueLC),
      baseValueUC: round1(baseValueUC),
      baseGlyphLC: `${BASELINE_LC}+${BASELINE_LC}`,
      baseGlyphUC: `${BASELINE_UC1}+${BASELINE_UC1}`,
      description:
        "gap[z] = right_A[z] + left_B[z], nur wenn BEIDE ≠ -1. " +
        "-1 bedeutet: Zone ungültig (kein Inhalt auf mindestens einer Seite).",
    },
    pairs: {},
  };

  const kerningLines = [];

  for (const keyA of glyphKeys) {
    const { right: rightA, charLabel: charA, unicode: unicodeA, glyphName: nameA } = glyphCache[keyA];
    pairsResult.pairs[keyA] = {};

    // Basiswert: UC nur wenn BEIDE Zeichen Großbuchstaben/Lining-Ziffern sind.
    // Bei gemischten Paaren (ein Groß, ein Klein) → LC-Basiswert.
    const classA    = classifyGlyph(unicodeA, nameA);
    const baseValue = classA === "UC" ? baseValueUC : baseValueLC;
    const baseTag   = classA === "UC" ? "UC" : "LC";

    for (const keyB of glyphKeys) {
      const { left: leftB, charLabel: charB, unicode: unicodeB, glyphName: nameB } = glyphCache[keyB];

      // Für pairs.json: strenger Gap (beide müssen gültig sein)
      pairsResult.pairs[keyA][keyB] = computePairGaps(rightA, leftB);

      // Für Kerning: Mittelwert + Kontrollwerte
      const calc = pairMean(rightA, leftB);
      if (calc === null) continue;

      // UC-Basiswert nur wenn BEIDE Zeichen UC sind; bei gemischten Paaren → LC
      const classB     = classifyGlyph(unicodeB, nameB);
      const bothUC     = classA === "UC" && classB === "UC";
      const baseValue  = bothUC ? baseValueUC : baseValueLC;
      const baseTag    = bothUC ? "UC" : (classA === "UC" || classB === "UC") ? "mixed→LC" : "LC";

      let correction = roundToModule(baseValue - calc.mean, KERN_ROUND);

      // Mindestabstand-Capping: nach Korrektur muss jede Zone ≥ baseValue/4 bleiben
      const minGap = baseValue / 4;
      const minZoneGap = Math.min(...calc.zoneValues.map(v => v.sum));
      const maxNegativeCorrection = roundInt(minZoneGap - minGap);

      let capped = false;
      if (correction < 0 && correction < -maxNegativeCorrection) {
        correction = roundToModule(-(minZoneGap - minGap), KERN_ROUND);
        capped = true;
      }

      const zoneDebug = calc.zoneValues.map(v => `z${v.z}:${v.sum}`).join(",");
      const capNote   = capped ? ` [cap:min=${round1(minZoneGap)}→${round1(minGap)}]` : "";

      kerningLines.push(`${charA};${charB};${correction} (${baseTag} ${zoneDebug})${capNote}`);
    }
  }

  return { marginsResult, pairsResult, kerningLines, baseValueLC, baseValueUC };
}

// ─── Einstiegspunkt ───────────────────────────────────────────────────────────

async function main() {
  for (const dir of [MARGINS_DIR, PAIRS_DIR, KERNING_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const fontFiles = fs.readdirSync(FONTS_DIR).filter(f =>
    /\.(ttf|otf)$/i.test(f)
  );

  if (fontFiles.length === 0) {
    console.error(`Keine TTF/OTF-Dateien in ${FONTS_DIR} gefunden.`);
    process.exit(1);
  }

  console.log(`\nFont-Margins, Pair-Gaps & Kerning`);
  console.log(`Zonen: ${ZONES}  |  Glättung: ${Math.round(SMOOTH_PCT*100)}%  |  Rundungsmodul: ${KERN_ROUND}  |  Fonts: ${fontFiles.length}\n`);

  for (const fontFile of fontFiles) {
    const fontPath   = path.join(FONTS_DIR, fontFile);
    const baseName   = path.basename(fontFile, path.extname(fontFile));
    const marginOut  = path.join(MARGINS_DIR, baseName + ".json");
    const pairsOut   = path.join(PAIRS_DIR,   baseName + ".json");
    const kerningOut = path.join(KERNING_DIR, baseName + ".csv");

    try {
      const { marginsResult, pairsResult, kerningLines, baseValueLC, baseValueUC } =
        await processFont(fontPath);

      const glyphCount = Object.keys(marginsResult.glyphs).length;

      fs.writeFileSync(marginOut, JSON.stringify(marginsResult, null, 2), "utf8");
      console.log(`  ✓ margins/${baseName}.json   (${glyphCount} Zeichen)`);

      if (pairsResult) {
        fs.writeFileSync(pairsOut, JSON.stringify(pairsResult, null, 2), "utf8");
        console.log(`  ✓ pairs/${baseName}.json     (${(glyphCount**2).toLocaleString()} Paare)`);
      }

      if (kerningLines) {
        const csvContent =
          `# Kerning | Font: ${baseName} | Zonen: ${ZONES} | Glättung: ${Math.round(SMOOTH_PCT*100)}% | Rundungsmodul: ${KERN_ROUND}\n` +
          `# Basiswert LC (n+n): Ø${round1(baseValueLC)}  |  Basiswert UC (O+O): Ø${round1(baseValueUC)}\n` +
          `# Format: LinkerBuchstabe;RechterBuchstabe;Korrekturwert (LC/UC z<i>:Zonenwert,...)\n` +
          `# Korrektur = round(Basiswert - PaarDurchschnitt) | Negativ=enger, Positiv=weiter\n` +
          kerningLines.join("\n") + "\n";

        fs.writeFileSync(kerningOut, csvContent, "utf8");
        console.log(`  ✓ kerning/${baseName}.csv    (${kerningLines.length.toLocaleString()} Einträge)\n`);
      }

    } catch (err) {
      console.error(`  ✗ Fehler bei ${fontFile}: ${err.message}`);
      console.error(err.stack);
    }
  }

  console.log("Fertig.");
  console.log(`  Margins → ./margins/`);
  console.log(`  Pairs   → ./pairs/`);
  console.log(`  Kerning → ./kerning/`);
}

main();