import type { Settings } from "@fc/shared";
import { Field } from "./Field.js";

interface Props {
  value: Settings;
  onChange: (s: Settings) => void;
}

/** Options avancées : toutes datables dans le cockpit, valeurs uniques dans le simulateur. */
export function SettingsForm({ value: s, onChange }: Props) {
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => {
    onChange({ ...s, [key]: v });
  };
  return (
    <div className="grid-2">
      <Field label="Caisse">
        <select
          value={s.caisse}
          onChange={(e) => {
            set("caisse", e.target.value as Settings["caisse"]);
          }}
        >
          <option value="regime_general">Régime général (SSI)</option>
          <option value="cipav">Cipav</option>
        </select>
      </Field>
      <Field label="TVA">
        <select
          value={s.tva}
          onChange={(e) => {
            set("tva", e.target.value as Settings["tva"]);
          }}
        >
          <option value="franchise">Franchise en base</option>
          <option value="assujetti">Assujetti</option>
        </select>
      </Field>
      <Field label="Versement libératoire">
        <select
          value={s.versementLiberatoire ? "oui" : "non"}
          onChange={(e) => {
            set("versementLiberatoire", e.target.value === "oui");
          }}
        >
          <option value="non">Non</option>
          <option value="oui">Oui</option>
        </select>
      </Field>
      <Field label="Acre : début d'activité" hint="Vide si pas d'Acre">
        <input
          type="date"
          value={s.acreDebutActivite ?? ""}
          onChange={(e) => {
            set("acreDebutActivite", e.target.value === "" ? null : e.target.value);
          }}
        />
      </Field>
      <Field label="Situation familiale">
        <select
          value={s.situationFamiliale}
          onChange={(e) => {
            const situation = e.target.value as Settings["situationFamiliale"];
            onChange({
              ...s,
              situationFamiliale: situation,
              parts: Math.max(s.parts, situation === "couple" ? 2 : 1),
            });
          }}
        >
          <option value="seul">Personne seule</option>
          <option value="couple">Couple (marié / pacsé)</option>
        </select>
      </Field>
      <Field label="Nombre de parts">
        <input
          type="number"
          min={s.situationFamiliale === "couple" ? 2 : 1}
          step={0.25}
          value={s.parts}
          onChange={(e) => {
            set("parts", Number(e.target.value));
          }}
        />
      </Field>
      <Field label="Autres revenus imposables du foyer (€/an)" hint="Net imposable, hors activité">
        <input
          type="number"
          min={0}
          step={100}
          value={s.autresRevenusImposables / 100}
          onChange={(e) => {
            set(
              "autresRevenusImposables",
              Math.round(Number(e.target.value) * 100) as Settings["autresRevenusImposables"],
            );
          }}
        />
      </Field>
      <Field
        label={`EURL IS / SASU : part en rémunération (${String(Math.round(s.partRemuneration * 100))} %)`}
        hint="Le reste du résultat, après IS, est versé en dividendes"
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.partRemuneration}
          onChange={(e) => {
            set("partRemuneration", Number(e.target.value));
          }}
        />
      </Field>
      <Field
        label="EURL IS : capital + comptes courants (€)"
        hint="Seuil des 10 % sur les dividendes"
      >
        <input
          type="number"
          min={0}
          step={100}
          value={s.capitalEtComptesCourants / 100}
          onChange={(e) => {
            set(
              "capitalEtComptesCourants",
              Math.round(Number(e.target.value) * 100) as Settings["capitalEtComptesCourants"],
            );
          }}
        />
      </Field>
      <Field label="Portage : frais de gestion (%)" hint="Ceux de ton contrat">
        <input
          type="number"
          min={0}
          max={30}
          step={0.5}
          value={Math.round(s.fraisGestionPortage * 1000) / 10}
          onChange={(e) => {
            set("fraisGestionPortage", Number(e.target.value) / 100);
          }}
        />
      </Field>
    </div>
  );
}
