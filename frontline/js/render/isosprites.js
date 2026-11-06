// Einheiten und Wracks in der isometrischen Ansicht: dünne Hülle um die gemalten 3D-Modelle (unitpaint.js, seit v5.27).
// Bilddateien gibt es für die Iso-Ansicht seit v5.43 keine mehr: Häuser, Hallen, Fabriken und Zug der Karte sind seit v5.23 gemalt
// (maptown.js), Militärgebäude seit v5.21 (milbuild.js), Bäume, Büsche und Felsen seit v5.28 (nature.js), Wachturm (maptown.js) und
// geparkte Autos (props.js) seit v5.43.
import { drawUnitIso, drawWreckIso } from './unitpaint.js';

/** Einheit in Iso (gemalt, unitpaint.js): Soldaten blicken zum Ziel, Türme folgen dem Ziel. false = noch kein Bild (Ersatz im Renderer). */
export function drawUnitSprite(ctx, cam, u, p, aim = null, lift = 0, now = 0) {
  return drawUnitIso(ctx, cam, u, p, aim, lift, now);
}

/** Wrack als verkohltes Fahrzeugmodell am Boden (auch abgeschossene Hubschrauber). false = kein Modell, der Renderer zeichnet Kästen. */
export function drawWreckSprite(ctx, cam, w, p) {
  return drawWreckIso(ctx, cam, w, p);
}
