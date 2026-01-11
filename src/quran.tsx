import { Action, ActionPanel, Icon, Keyboard, List, showToast } from "@raycast/api";
import { JSX, useEffect, useMemo, useState } from "react";
import { useQuran } from "./hooks/useQuran";
import { getSurah, getAyahs, getEdition, getAyahByReference } from "./utils/api";
import { addAyahToFavorites, filterSurahs } from "./utils";
import { BASE_QURAN_URL } from "./utils/constants";
import { Surah, Ayah } from "./types";

const SURAH_AYAH_REFERENCE_REGEX = /^(\d{1,3})\s*[:/]\s*(\d{1,3})$/;

export default function Command() {
  const [rawSearchText, setRawSearchText] = useState("");
  const searchText = useMemo(() => rawSearchText.trim(), [rawSearchText]);

  const [quickReference, setQuickReference] = useState<string | null>(null);
  const [quickLookupLabel, setQuickLookupLabel] = useState<string | null>(null);
  const [quickAyah, setQuickAyah] = useState<Ayah | null>(null);
  const [quickAyahError, setQuickAyahError] = useState<string | null>(null);
  const [isQuickAyahLoading, setIsQuickAyahLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();

  const { data: surahs, isLoading } = useQuran<Surah[]>({
    apiFn: getSurah,
    cacheKey: `surahs-${getEdition()}`,
  });

  const filteredSurahs = useMemo(() => {
    const normalized = normalizeSearchInput(searchText);
    return normalized ? filterSurahs(surahs, normalized) : (surahs ?? undefined);
  }, [searchText, surahs]);

  useEffect(() => {
    const match = searchText.match(SURAH_AYAH_REFERENCE_REGEX);
    if (!match) {
      setQuickLookupLabel(null);
      setQuickReference((prev) => (prev === null ? prev : null));
      setQuickAyah(null);
      setQuickAyahError(null);
      setIsQuickAyahLoading(false);
      return;
    }

    const surahNumber = parseInt(match[1], 10);
    const ayahNumber = parseInt(match[2], 10);
    const normalizedReference = `${surahNumber}:${ayahNumber}`;
    setQuickLookupLabel(normalizedReference);

    if (surahNumber < 1 || surahNumber > 114) {
      setQuickReference(null);
      setQuickAyah(null);
      setQuickAyahError("Surah numbers range from 1 to 114");
      setIsQuickAyahLoading(false);
      return;
    }

    if (ayahNumber < 1) {
      setQuickReference(null);
      setQuickAyah(null);
      setQuickAyahError("Ayah numbers must be positive");
      setIsQuickAyahLoading(false);
      return;
    }

    const selectedSurah = surahs?.find((surah) => surah.number === surahNumber);
    if (selectedSurah && ayahNumber > selectedSurah.numberOfAyahs) {
      setQuickReference(null);
      setQuickAyah(null);
      setQuickAyahError(`${selectedSurah.englishName} only has ${selectedSurah.numberOfAyahs} ayahs`);
      setIsQuickAyahLoading(false);
      return;
    }

    setQuickAyahError(null);
    setQuickReference((prev) => (prev === normalizedReference ? prev : normalizedReference));
  }, [searchText, surahs]);

  useEffect(() => {
    if (!quickReference) {
      return;
    }

    let didCancel = false;

    async function fetchQuickAyah() {
      setIsQuickAyahLoading(true);
      setQuickAyah(null);
      setQuickAyahError(null);

      try {
        const ayah = await getAyahByReference(quickReference);
        if (didCancel) {
          return;
        }
        if (ayah) {
          setQuickAyah(ayah);
        } else {
          setQuickAyahError("Ayah not found");
        }
      } catch (error) {
        console.error("Quick lookup failed", error);
        if (!didCancel) {
          setQuickAyahError("Unable to load ayah");
        }
      } finally {
        if (!didCancel) {
          setIsQuickAyahLoading(false);
        }
      }
    }

    fetchQuickAyah();

    return () => {
      didCancel = true;
    };
  }, [quickReference]);

  useEffect(() => {
    setSelectedItemId((current) => {
      if (!quickLookupLabel) {
        return current?.startsWith("quick-") ? undefined : current;
      }

      if (!current || !current.startsWith("quick-")) {
        return `quick-${quickLookupLabel}`;
      }

      return current;
    });
  }, [quickLookupLabel]);

  const shouldShowQuickDetail = Boolean(quickLookupLabel && quickAyah);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setRawSearchText}
      searchBarPlaceholder="Search by name/number or jump with 2:255 or 2/255"
      selectedItemId={selectedItemId}
      onSelectionChange={(itemId) => setSelectedItemId(itemId)}
      isShowingDetail={shouldShowQuickDetail}
    >
      {quickLookupLabel ? (
        <List.Section title={`Quick Lookup – ${quickLookupLabel}`}>
          {isQuickAyahLoading ? (
            <List.Item
              id={`quick-${quickLookupLabel}`}
              key={`quick-loading-${quickLookupLabel}`}
              title="Fetching ayah…"
              icon={Icon.Download}
            />
          ) : quickAyah ? (
            <QuickLookupResult key={`quick-${quickLookupLabel}`} ayah={quickAyah} />
          ) : quickAyahError ? (
            <List.Item
              id={`quick-${quickLookupLabel}`}
              key={`quick-error-${quickLookupLabel}`}
              title={quickAyahError}
              icon={Icon.ExclamationMark}
            />
          ) : null}
        </List.Section>
      ) : null}

      {!quickLookupLabel
        ? filteredSurahs?.map((surah) => (
            <List.Item
              id={`surah-${surah.number}`}
              key={surah.number}
              title={surah.englishName}
              subtitle={surah.englishNameTranslation}
              icon={{ source: "quran_logo.png" }}
              accessories={[
                {
                  text: surah.numberOfAyahs.toString(),
                  tooltip: "Number of Ayahs",
                  icon: { source: "quran.png" },
                },
                {
                  text: surah.revelationType,
                  tooltip: "Revelation Type",
                  icon: { source: `${surah.revelationType}.png` },
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push target={<ReadSurah surah={surah} />} title="Read" />
                  <Action.OpenInBrowser
                    url={`${BASE_QURAN_URL}/${surah.number}`}
                    title="Read in Browser"
                    shortcut={Keyboard.Shortcut.Common.Open}
                  />
                  <Action.CopyToClipboard
                    title="Copy Link"
                    content={`${BASE_QURAN_URL}/${surah.number}`}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                </ActionPanel>
              }
            />
          ))
        : null}
    </List>
  );
}

const ReadSurah = ({ surah }: { surah: Surah }): JSX.Element => {
  const { data: Ayahs, isLoading } = useQuran<Ayah[]>({
    apiFn: () => getAyahs(surah.number),
    cacheKey: `surah-${surah.number}-${getEdition()}`,
  });

  return (
    <List isLoading={isLoading} isShowingDetail navigationTitle="Ayahs">
      <List.Section title={surah.englishName} subtitle={`${surah.englishNameTranslation} - ${surah.numberOfAyahs}`}>
        {Ayahs?.map((ayah) => (
          <AyahListItem
            key={`${surah.number}-${ayah.number}`}
            ayah={ayah}
            surah={{ englishName: surah.englishName, number: surah.number }}
          />
        ))}
      </List.Section>
    </List>
  );
};

const AyahListItem = ({
  ayah,
  surah,
  title,
}: {
  ayah: Ayah;
  surah: Pick<Surah, "englishName" | "number">;
  title?: string;
}) => (
  <List.Item
    title={title ?? `${ayah.numberInSurah}`}
    icon={{ source: "quran_logo.png" }}
    detail={
      <List.Item.Detail
        markdown={buildAyahMarkdown(ayah)}
        metadata={<AyahDetailMetadata ayah={ayah} surah={surah} />}
      />
    }
    actions={
      <ActionPanel>
        <AyahActions ayah={ayah} surah={surah} />
      </ActionPanel>
    }
  />
);

const QuickLookupResult = ({ ayah }: { ayah: Ayah }) => {
  const surah = resolveSurahInfo(ayah);
  return (
    <List.Item
      id={`quick-${surah.number}:${ayah.numberInSurah}`}
      title={`${surah.englishName} ${surah.number}:${ayah.numberInSurah}`}
      subtitle={ayah.text}
      icon={{ source: Icon.MagnifyingGlass }}
      detail={
        <List.Item.Detail
          markdown={buildAyahMarkdown(ayah)}
          metadata={<AyahDetailMetadata ayah={ayah} surah={surah} />}
        />
      }
      actions={
        <ActionPanel>
          <AyahActions ayah={ayah} surah={surah} />
        </ActionPanel>
      }
    />
  );
};

const buildAyahMarkdown = (ayah: Pick<Ayah, "text" | "arabicText">): string => {
  return `${ayah.arabicText ? `${ayah.arabicText}\n\n` : ""}${ayah.text}`;
};

const AyahDetailMetadata = ({ ayah, surah }: { ayah: Ayah; surah: Pick<Surah, "englishName" | "number"> }) => {
  const resolvedSurah = resolveSurahInfo(ayah, surah);
  const ayahUrl = `${BASE_QURAN_URL}/${resolvedSurah.number}/${ayah.numberInSurah}`;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Surah" text={`${resolvedSurah.englishName} (${resolvedSurah.number})`} />
      <List.Item.Detail.Metadata.Label title="Ayah" text={`${ayah.numberInSurah}`} />
      <List.Item.Detail.Metadata.Label title="Juz" text={`${ayah.juz}`} />
      <List.Item.Detail.Metadata.Label title="Page" text={`${ayah.page}`} />
      <List.Item.Detail.Metadata.Label title="Hizb Quarter" text={`${ayah.hizbQuarter}`} />
      <List.Item.Detail.Metadata.Label title="Ruku" text={`${ayah.ruku}`} />
      <List.Item.Detail.Metadata.Label title="Manzil" text={`${ayah.manzil}`} />
      <List.Item.Detail.Metadata.Label title="Sajda" text={ayah.sajda ? "Yes" : "No"} />
      <List.Item.Detail.Metadata.Link title="Read in Browser" text="Open" target={ayahUrl} />
    </List.Item.Detail.Metadata>
  );
};

const AyahActions = ({ ayah, surah }: { ayah: Ayah; surah: Pick<Surah, "englishName" | "number"> }) => {
  const ayahLocationLabel = `${surah.englishName} ${surah.number}:${ayah.numberInSurah}`;
  const ayahUrl = `${BASE_QURAN_URL}/${surah.number}/${ayah.numberInSurah}`;

  return (
    <>
      <Action.OpenInBrowser url={ayahUrl} title="Read in Browser" shortcut={Keyboard.Shortcut.Common.Open} />
      <Action.CopyToClipboard
        title="Copy Translation"
        content={`${ayah.text}\n\n${ayahLocationLabel}`}
        shortcut={Keyboard.Shortcut.Common.Copy}
      />
      <Action.CopyToClipboard
        title="Copy Arabic"
        content={`${ayah.arabicText ?? ""}\n\n${ayahLocationLabel}`}
        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
      />
      <Action.CopyToClipboard
        title="Copy Arabic & Translation"
        content={`${ayah.arabicText ?? ""}\n\n${ayah.text}\n\n${ayahLocationLabel}`}
        shortcut={{ modifiers: ["cmd", "shift"], key: "b" }}
      />
      <Action
        title="Add to Favorites"
        icon={Icon.Star}
        shortcut={{ macOS: { key: "f", modifiers: ["cmd"] }, Windows: { key: "f", modifiers: ["ctrl"] } }}
        onAction={async () => {
          await addAyahToFavorites({
            text: ayah.text,
            arabicText: ayah.arabicText,
            ayahNumber: ayah.numberInSurah,
            surah: surah.englishName,
            surahNumber: surah.number,
          });
          showToast({ title: "Added to Favorites" });
        }}
      />
    </>
  );
};

const normalizeSearchInput = (value: string): string => {
  const delimiterIndex = Math.min(
    ...[":", "/"].map((delimiter) => {
      const idx = value.indexOf(delimiter);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    }),
  );

  if (!Number.isFinite(delimiterIndex)) {
    return value;
  }

  return value.slice(0, delimiterIndex).trim();
};

const resolveSurahInfo = (ayah: Ayah, fallback?: Surah): Pick<Surah, "englishName" | "number"> => {
  const surahInfo = ayah.surah ?? fallback;
  if (surahInfo) {
    return { englishName: surahInfo.englishName, number: surahInfo.number };
  }
  return { englishName: "Surah", number: 0 };
};
