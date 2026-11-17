/** Umbrales del motor de seguimiento que no están en RULES (src/lib/planning.ts). */

/** Sobre esta velocidad (km/h) el camión se considera en movimiento. */
export const MOVING_KMH = 3;
/** Bajo esta velocidad dentro de la geocerca de un checkpoint cuenta como espera en aduana. */
export const CROSSING_KMH = 10;
/** Conducción continua desde la que una detención con motor apagado es descanso. */
export const REST_AFTER_DRIVING_MIN = 240;
/** Detención continua que reinicia la conducción continua (con 0,5 min de tolerancia por el paso del reloj). */
export const RESET_STOP_MIN = 120 - 0.5;
/** Duración del descanso, para calcular lo que resta. */
export const REST_MIN = 120;
/** Minutos que se asume que demora una reparación. */
export const BREAKDOWN_FIX_MIN = 30;
/** Histéresis del estado, en minutos. */
export const HYSTERESIS_MIN = 2;
/** Causas con menos minutos que esto no se informan. */
export const MIN_CAUSE_MIN = 2;
/** Velocidad bajo esta fracción de la planificada = congestión. */
export const SLOW_FACTOR = 0.45;
/** Minutos avanzando lento para considerarlo congestión. */
export const SLOW_AFTER_MIN = 4;
/** Salida más tardía que esto dispara la alerta de salida tardía. */
export const LATE_DEPARTURE_ALERT_MIN = 10;
