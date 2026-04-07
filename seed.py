"""
DÉDALE — Injection des données de test
Exécution : python seed.py
(fermer l'app avant de lancer)
"""
import sqlite3
import os
import sys

DB_DIR = os.path.join(os.environ["APPDATA"], "com.dedale.app")
DB_PATH = os.path.join(DB_DIR, "dedale.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "src-tauri", "schema.sql")
SEED_PATH = os.path.join(os.path.dirname(__file__), "src-tauri", "seed.sql")

def main():
    # Supprimer la base existante
    for ext in ["", "-shm", "-wal"]:
        path = DB_PATH + ext
        if os.path.exists(path):
            os.remove(path)
            print(f"  Supprimé : {path}")

    # Supprimer le dossier documents (fichiers orphelins des anciennes bases)
    docs_dir = os.path.join(DB_DIR, "documents")
    if os.path.isdir(docs_dir):
        import shutil
        shutil.rmtree(docs_dir)
        print(f"  Supprimé : {docs_dir}")

    os.makedirs(DB_DIR, exist_ok=True)

    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")

    # Schéma
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        db.executescript(f.read())
    db.execute("PRAGMA user_version = 1")
    print("Schema OK")

    # Seed
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        db.executescript(f.read())
    print("Seed OK")

    # Vérification
    print()
    for t in ["batiments", "niveaux", "locaux", "techniciens", "prestataires",
              "categories_modeles", "modeles_equipements", "champs_modele",
              "equipements", "valeurs_equipements",
              "gammes", "operations", "gammes_equipements",
              "modeles_operations", "modeles_operations_items", "gamme_modeles",
              "contrats", "contrats_gammes", "ordres_travail", "operations_execution",
              "demandes_intervention", "di_localisations", "di_gammes",
              "di_equipements", "modeles_di"]:
        c = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {c}")

    # Vérifier que toutes les familles ont un modèle
    orphans = db.execute(
        "SELECT nom_famille FROM familles_equipements WHERE id_modele_equipement IS NULL"
    ).fetchall()
    if orphans:
        print(f"\n  ERREUR : familles sans modèle : {[r[0] for r in orphans]}")
    else:
        print("\n  OK : toutes les familles ont un modèle")

    print()
    print("Tu peux relancer l'app : npm run tauri dev")
    db.close()

if __name__ == "__main__":
    main()
