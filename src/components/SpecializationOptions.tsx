/** Suggestions for the free-text specialization field (`<input list="specialization-options">`).
 * Free text is still allowed — these just speed up the common oncology answers. */
const SPECIALIZATIONS = [
  'Medical Oncology',
  'Radiation Oncology',
  'Surgical Oncology',
  'Haemato-Oncology',
  'Paediatric Oncology',
  'Gynaecologic Oncology',
  'Head & Neck Oncology',
  'Neuro-Oncology',
  'Thoracic Oncology',
  'Uro-Oncology',
  'Breast Oncology',
  'GI Oncology',
  'Pathology',
  'Radiology',
  'Palliative Care',
];

export function SpecializationOptions() {
  return (
    <datalist id="specialization-options">
      {SPECIALIZATIONS.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  );
}
