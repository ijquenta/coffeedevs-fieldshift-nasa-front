import boliviaMunicipalityData from "./bolivia-municipalities.json";
import type { FarmLocation, Position } from "../types/wizard";

export interface MunicipalityOption { name: string; pcode: string; center: Position }
export interface DepartmentOption { name: string; pcode: string; municipalities: MunicipalityOption[] }
export interface CountryOption { name: string; code: string; departments: DepartmentOption[] }

type MunicipalityRecord = {
  pcode: string;
  name: string;
  departmentCode: string;
  department: string;
  center: [number, number];
};

const municipalities = boliviaMunicipalityData.municipalities.map((municipality) => ({
  ...municipality,
  center: municipality.center as [number, number],
})) as MunicipalityRecord[];
const departments: DepartmentOption[] = Array.from( 
  new Map(municipalities.map((municipality) => [municipality.departmentCode, municipality.department])).entries(),
  ([pcode, name]) => ({
    name,
    pcode,
    municipalities: municipalities
      .filter((municipality) => municipality.departmentCode === pcode)
      .map(({ name: municipalityName, pcode: municipalityCode, center }) => ({
        name: municipalityName,
        pcode: municipalityCode,
        center,
      })),
  }),
);

// Datos estáticos reales de municipios de Bolivia. Fuente y licencia en bolivia-municipalities.json.
// La capa fuente también incluye 3 TIOC; se excluyeron porque este selector pide municipios.
export const COUNTRIES: CountryOption[] = [{ name: "Bolivia", code: "BOL", departments }];

export const locationService = {
  async getCountries() { return COUNTRIES.map(({ name, code }) => ({ name, code })); },
  async getDepartments(countryCode: string) { return COUNTRIES.find((country) => country.code === countryCode)?.departments ?? []; },
  async getMunicipalities(countryCode: string, departmentCode: string) {
    return COUNTRIES.find((country) => country.code === countryCode)?.departments.find((department) => department.pcode === departmentCode)?.municipalities ?? [];
  },
  resolve(countryCode: string, departmentCode: string, municipalityCode: string): FarmLocation | null {
    const country = COUNTRIES.find((item) => item.code === countryCode);
    const department = country?.departments.find((item) => item.pcode === departmentCode);
    const municipality = department?.municipalities.find((item) => item.pcode === municipalityCode);
    if (!country || !department || !municipality) return null;
    return { country: country.name, countryCode, department: department.name, municipality: municipality.name, pcode: municipality.pcode, center: municipality.center };
  },
};
