/// Constantes SQL pour les bornes de la semaine ISO courante.
/// `'localtime'` aligne `now` sur le fuseau local : sans ça, `date('now')` reste
/// en UTC et bascule de jour avec plusieurs heures de retard (la semaine ISO
/// courante restait celle de la veille jusqu'au lever du jour en Europe).
/// `'+1 day'` contourne le bug SQLite où `weekday 1` renvoie today si today=lundi
/// (sans ce shift, on récupère le lundi de la semaine précédente sur les lundis).
pub const LUNDI_COURANT: &str = "date('now', 'localtime', '+1 day', 'weekday 1', '-7 days')";
pub const LUNDI_PROCHAIN: &str = "date('now', 'localtime', '+1 day', 'weekday 1')";
