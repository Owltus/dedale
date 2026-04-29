/// Constantes SQL pour les bornes de la semaine ISO courante.
/// `'+1 day'` contourne le bug SQLite où `weekday 1` renvoie today si today=lundi
/// (sans ce shift, on récupère le lundi de la semaine précédente sur les lundis).
pub const LUNDI_COURANT: &str = "date('now', '+1 day', 'weekday 1', '-7 days')";
pub const LUNDI_PROCHAIN: &str = "date('now', '+1 day', 'weekday 1')";
