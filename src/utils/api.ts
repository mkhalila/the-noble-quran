import axios from "axios";
import { Edition, Surah, Ayah } from "../types";
import { getPreferenceValues } from "@raycast/api";
import { DEFAULT_ARABIC_EDITION } from "./constants";

/**
 * @constant BASE_URL - the base URL for the API
 */
const BASE_URL = "https://api.alquran.cloud/v1";

/**
 * @description - the axios instance for the API with the base URL and headers
 */
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * @function getEdition - get the edition from user configuration
 * @returns {string} - the edition from user configuration
 */
export const getEdition = (): string => {
  return getPreferenceValues<Edition>().edition;
};

/**
 * @function getSurahs - get the surahs from the API
 * @returns {Promise} - the promise of the API call
 */

export const getSurah = async (): Promise<Surah[]> => {
  try {
    const { data } = await api.get(`/surah`);
    return data.data;
  } catch (error) {
    console.error(error);
    return [];
  }
};

/**
 * @function getAyahs - get the ayahs from the API
 * @param {number} surahNumber - the surah number
 * @returns {Promise} - the promise of the API call
 */

export const getAyahs = async (surahNumber: number): Promise<Ayah[]> => {
  try {
    const userEdition = getEdition();
    const { data } = await api.get(`/surah/${surahNumber}/editions/${userEdition},${DEFAULT_ARABIC_EDITION}`);
    const editions = data.data as { edition: { identifier: string }; ayahs: Ayah[] }[];
    const translationEdition = editions.find(({ edition }) => edition.identifier === userEdition);
    const arabicEdition = editions.find(({ edition }) => edition.identifier === DEFAULT_ARABIC_EDITION);

    if (!translationEdition) {
      return [];
    }

    const arabicAyahMap = new Map((arabicEdition?.ayahs ?? []).map((ayah) => [ayah.numberInSurah, ayah.text]));

    return translationEdition.ayahs.map((ayah) => ({
      ...ayah,
      arabicText: arabicAyahMap.get(ayah.numberInSurah),
    }));
  } catch (error) {
    console.error(error);
    return [];
  }
};
