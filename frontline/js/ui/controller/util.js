// Spieler-Steuerung: gemeinsame Hilfsfunktionen der Controller-Module (js/ui/controller/). Kein DOM.

import { BALANCE } from '../../data/balance.js';

export const WALL_MAX = BALANCE.construction.wallMax; // max. Zellen je Mauerzug (Vorschau; der Befehl prüft dasselbe)

export const isCarrier = (u) => u.def.cargoCap > 0; // LKW und Transporthubschrauber
