type TemplateField = { key: string; label?: string | null };

type VehicleLicenceFields = {
  registration: string;
  vehicleType: string;
  make: string;
  model: string;
  colour: string;
  vin: string;
  engine: string;
  expiryDate: string;
};

const FIELD_ALIASES: Record<string, keyof VehicleLicenceFields> = {
  reg: 'registration',
  regno: 'registration',
  regnumber: 'registration',
  registration: 'registration',
  registrationno: 'registration',
  registrationnumber: 'registration',
  vehiclereg: 'registration',
  vehicleregistration: 'registration',
  platenumber: 'registration',
  numberplate: 'registration',
  licenseplate: 'registration',
  licenceplate: 'registration',
  vehicletype: 'vehicleType',
  bodytype: 'vehicleType',
  make: 'make',
  model: 'model',
  colour: 'colour',
  color: 'colour',
  vin: 'vin',
  chassis: 'vin',
  chassisnumber: 'vin',
  eng: 'engine',
  engineno: 'engine',
  enginenumber: 'engine',
  engine: 'engine',
  expiry: 'expiryDate',
  expirydate: 'expiryDate',
  licencediskexpiry: 'expiryDate',
  licencediscexpiry: 'expiryDate',
  licensediskexpiry: 'expiryDate',
  licensediscexpiry: 'expiryDate',
};

const normalizeFieldName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function decodeVehicleLicenceBarcode(raw: string): VehicleLicenceFields | null {
  const values = raw.split('%').filter(Boolean);
  if (
    values.length !== 14
    || !values[0].startsWith('MVL')
    || !/^\d{4}-\d{2}-\d{2}$/.test(values[13])
  ) {
    return null;
  }

  return {
    registration: values[6],
    vehicleType: values[7],
    make: values[8],
    model: values[9],
    colour: values[10],
    vin: values[11],
    engine: values[12],
    expiryDate: values[13],
  };
}

export function mapVehicleLicenceBarcodeToTemplateFields(
  raw: string,
  fields: TemplateField[],
): Record<string, string> | null {
  const decoded = decodeVehicleLicenceBarcode(raw);
  if (!decoded) return null;

  const mapped: Record<string, string> = {};
  for (const field of fields) {
    const canonicalName = [field.key, field.label]
      .filter((name): name is string => Boolean(name))
      .map(normalizeFieldName)
      .map((name) => FIELD_ALIASES[name])
      .find((name): name is keyof VehicleLicenceFields => Boolean(name));
    if (canonicalName) mapped[field.key] = decoded[canonicalName];
  }

  return Object.keys(mapped).length ? mapped : null;
}
