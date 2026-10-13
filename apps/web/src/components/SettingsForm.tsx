import type { Settings } from "@fc/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Field } from "./Field";
import { MoneyInput } from "./MoneyInput";

interface Props {
  value: Settings;
  onChange: (s: Settings) => void;
}

export function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onChange(v as T);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <h4 className="text-xs font-semibold tracking-wider text-primary uppercase">{title}</h4>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Options avancées : toutes datables dans les réglages, valeurs uniques dans le simulateur. */
export function SettingsForm({ value: s, onChange }: Props) {
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => {
    onChange({ ...s, [key]: v });
  };
  return (
    <div className="grid grid-cols-1 gap-6">
      <Section title="Activité">
        <Field label="Caisse">
          <Choice
            value={s.caisse}
            options={[
              ["regime_general", "Régime général (SSI)"],
              ["cipav", "Cipav"],
            ]}
            onChange={(v) => {
              set("caisse", v);
            }}
          />
        </Field>
        <Field label="TVA">
          <Choice
            value={s.tva}
            options={[
              ["franchise", "Franchise en base"],
              ["assujetti", "Assujetti"],
            ]}
            onChange={(v) => {
              set("tva", v);
            }}
          />
        </Field>
        <Field label="Acre : début d'activité" hint="Vide si pas d'Acre">
          <Input
            type="date"
            value={s.acreDebutActivite ?? ""}
            onChange={(e) => {
              set("acreDebutActivite", e.target.value === "" ? null : e.target.value);
            }}
          />
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="vl" className="text-sm">
              Versement libératoire
            </Label>
            <p className="text-xs text-muted-foreground">Impôt payé avec les cotisations</p>
          </div>
          <Switch
            id="vl"
            checked={s.versementLiberatoire}
            onCheckedChange={(v) => {
              set("versementLiberatoire", v);
            }}
          />
        </div>
      </Section>

      <Separator />
      <Section title="Foyer fiscal">
        <Field label="Situation familiale">
          <Choice
            value={s.situationFamiliale}
            options={[
              ["seul", "Personne seule"],
              ["couple", "Couple (marié / pacsé)"],
            ]}
            onChange={(situation) => {
              onChange({
                ...s,
                situationFamiliale: situation,
                parts: Math.max(s.parts, situation === "couple" ? 2 : 1),
              });
            }}
          />
        </Field>
        <Field label="Nombre de parts">
          <Input
            type="number"
            min={s.situationFamiliale === "couple" ? 2 : 1}
            step={0.25}
            value={s.parts}
            onChange={(e) => {
              set("parts", Number(e.target.value));
            }}
          />
        </Field>
        <Field
          label="Autres revenus imposables du foyer (par an)"
          hint="Net imposable, hors activité"
        >
          <MoneyInput
            value={s.autresRevenusImposables}
            onChange={(v) => {
              set("autresRevenusImposables", v as Settings["autresRevenusImposables"]);
            }}
          />
        </Field>
      </Section>

      <Separator />
      <Section title="Sociétés et portage">
        <div className="grid gap-3 sm:col-span-2">
          <div className="flex items-center justify-between text-sm">
            <Label>EURL IS / SASU : part du résultat en rémunération</Label>
            <span className="num font-semibold text-primary">
              {Math.round(s.partRemuneration * 100)} %
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[Math.round(s.partRemuneration * 100)]}
            onValueChange={([v]) => {
              set("partRemuneration", (v ?? 0) / 100);
            }}
            aria-label="Part du résultat en rémunération"
          />
          <p className="text-xs text-muted-foreground">
            Le reste, après IS, est versé en dividendes.
          </p>
        </div>
        <Field
          label="EURL IS : capital + comptes courants"
          hint="Seuil des 10 % sur les dividendes"
        >
          <MoneyInput
            value={s.capitalEtComptesCourants}
            onChange={(v) => {
              set("capitalEtComptesCourants", v as Settings["capitalEtComptesCourants"]);
            }}
          />
        </Field>
        <Field label="Portage : frais de gestion (%)" hint="Ceux de ton contrat">
          <Input
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
      </Section>
    </div>
  );
}
