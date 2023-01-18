import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useParams,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { ArrowUp, ArrowDown, X } from "phosphor-react";
import ReactLoading from "react-loading";

import ArtifactFitnessCard from "./ArtifactFitnessCard";
import Paginator from "../Paginator";
import SetSelect from "../sets/SetSelect";
import AttributePositionSelect from "./AttributePositionSelect";
import { defaultFitness, defaultRarity } from "../../utils/config";
import {
  calculateFitsAndRarity,
  updateFitsAndRarity,
} from "../../store/reducers/artifacts";
import { getArtifactsResultHash } from "../../utils/hash";
import useQueryParams from "../../hooks/useQueryParams";

const BackToHome = ({ t, title, navigate }) => {
  return (
    <div className="card w-96 bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">{t(title)}!</h2>
        <div className="card-actions justify-end">
          <button
            className="btn btn-primary"
            onClick={() => navigate("/", { replace: true })}
          >
            {t("Back to home")}
          </button>
        </div>
      </div>
    </div>
  );
};

const ArtifactsUpload = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();
  const { artifactsId } = useParams();
  const artifacts = useSelector(
    (state) => state.uploads.artifacts[artifactsId].items
  );
  const format = useSelector(
    (state) => state.uploads.artifacts[artifactsId].format
  );
  const { builds, config } = useSelector((state) => state.build);
  const presetBuilds = useSelector((state) => state.presets.builds);
  const enabledBuilds = useMemo(() => {
    const enabledBuilds = {};
    for (const key of Object.keys(builds)) {
      if (config[key] && config[key].enabled) {
        enabledBuilds[key] = builds[key];
      }
    }
    for (const key of Object.keys(presetBuilds)) {
      if (config[key] && config[key].enabled) {
        enabledBuilds[key] = presetBuilds[key];
      }
    }
    return enabledBuilds;
  }, [builds, presetBuilds, config]);

  const resultHash = useMemo(() => getArtifactsResultHash(enabledBuilds));
  const { allFits, allRarity } = useSelector(
    (state) =>
      ((state.artifacts.fitsAndRarity || {})[artifactsId] || {})[
        resultHash
      ] ?? {
        allFits: {},
        allRarity: {},
      }
  );
  const isLoading = useMemo(
    () =>
      Object.keys(allFits).length === 0 || Object.keys(allRarity).length === 0,
    [allFits, allRarity]
  );
  const [progress, setProgress] = useState(0);
  const calculator = useMemo(
    () =>
      new Worker(new URL("../../workers/calculator.ts", import.meta.url), {
        type: "module",
      }),
    []
  );

  const [
    fitness,
    rarity,
    set,
    pos,
    sortKey,
    page,
    offset,
    setFitness,
    setRarity,
    setSet,
    setPos,
    setSortKey,
    setPage,
    setOffset,
  ] = useQueryParams([
    {
      name: "fitness",
      defaultValue: defaultFitness,
      isNumeric: true,
      replace: false,
    },
    {
      name: "rarity",
      defaultValue: defaultRarity,
      isNumeric: true,
      replace: false,
    },
    { name: "set", defaultValue: 0, isNumeric: true, replace: false },
    { name: "position", defaultValue: 0, isNumeric: true, replace: false },
    { name: "sort", defaultValue: "rarity-desc", replace: false },
    { name: "page", defaultValue: 0, isNumeric: true, replace: false },
    { name: "offset", defaultValue: 20, isNumeric: true, replace: false },
  ]);

  const compareFn = useCallback(
    (a, b) => {
      if (
        !!!allFits[a] ||
        !!!allFits[b] ||
        !!!allRarity[a] ||
        !!!allRarity[b]
      ) {
        return 0;
      }
      if (sortKey === "rarity-desc") {
        return allRarity[b] - allRarity[a];
      } else if (sortKey === "rarity-asc") {
        return allRarity[a] - allRarity[b];
      } else if (sortKey === "fitness-desc") {
        return (
          Math.max(...Object.values(allFits[b])) -
          Math.max(...Object.values(allFits[a]))
        );
      } else if (sortKey === "fitness-asc") {
        return (
          Math.max(...Object.values(allFits[a])) -
          Math.max(...Object.values(allFits[b]))
        );
      }
    },
    [sortKey, allFits, allRarity]
  );
  const filterFn = useCallback(
    (idx) => {
      let ret =
        allFits[idx] &&
        allRarity[idx] &&
        (Math.max(...Object.values(allFits[idx])) >= Number(fitness) ||
          allRarity[idx] >= rarity);
      if (set > 0) {
        ret = ret && artifacts[idx].set === set;
      }
      if (pos > 0) {
        ret = ret && artifacts[idx].position === pos;
      }
      return ret;
    },
    [fitness, rarity, allFits, allRarity, set, pos]
  );
  const filteredArtifacts = useMemo(
    () =>
      artifacts && artifacts.length > 0
        ? [...artifacts.map((_, index) => index)]
            .sort(compareFn)
            .filter(filterFn)
        : [],
    [artifacts, compareFn, filterFn, page, offset]
  );
  const handleDownloadYasLock = useCallback(() => {
    const element = document.createElement("a");
    const file = new Blob(
      [
        JSON.stringify(
          filteredArtifacts.filter((idx) => !artifacts[idx].locked)
        ),
      ],
      { type: "text/json" }
    );
    element.href = URL.createObjectURL(file);
    element.download = "lock.json";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }, [filteredArtifacts]);

  const handleSortChange = useCallback(
    (newSortKey) => {
      if (newSortKey.split("-")[0] === sortKey.split("-")[0]) {
        setSortKey(
          newSortKey.split("-")[0] +
            "-" +
            (sortKey.split("-")[1] === "asc" ? "desc" : "asc")
        );
      } else {
        setSortKey(newSortKey);
      }
    },
    [sortKey]
  );

  useEffect(() => {
    if (
      artifacts === undefined ||
      artifacts.length === 0 ||
      Object.keys(enabledBuilds).length === 0
    ) {
      return;
    }
    if (window.Worker) {
      calculator.postMessage({ artifacts, builds: enabledBuilds });
      calculator.onmessage = (e) => {
        if (!isNaN(Number(e.data))) {
          setProgress(e.data);
        } else {
          const { allFits, allRarity } = e.data;
          dispatch(
            updateFitsAndRarity({
              hash: artifactsId,
              enabledBuilds,
              allFits,
              allRarity,
            })
          );
        }
      };
    } else {
      setTimeout(() => {
        dispatch(
          calculateFitsAndRarity({
            hash: artifactsId,
            artifacts,
            enabledBuilds,
          })
        );
      }, 0);
    }
  }, [enabledBuilds, artifacts]);

  if (artifacts === undefined) {
    return (
      <BackToHome
        t={t}
        title="No uploaded artifacts founds"
        navigate={navigate}
      />
    );
  } else if (Object.keys(enabledBuilds).length === 0) {
    return <BackToHome t={t} title="No enabled builds" navigate={navigate} />;
  }
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <div className="flex w-full flex-col items-center justify-center space-y-2 md:flex-row md:space-y-0 md:space-x-12">
        <div className="flex w-4/5 flex-row items-center justify-center space-x-2 md:w-1/5">
          <span className="whitespace-nowrap font-bold">{t("Fitness")}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={fitness}
            className="range range-primary"
            onChange={(e) => setFitness(e.target.value)}
          />
          <span>{(fitness * 100).toFixed(0)}%</span>
        </div>
        <div className="flex w-4/5 flex-row items-center justify-center space-x-2 md:w-1/5">
          <span className="whitespace-nowrap font-bold">{t("Rarity")}</span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={rarity}
            className="range range-secondary"
            onChange={(e) => setRarity(e.target.value)}
          />
          <span>{Number(rarity).toFixed(1)}</span>
        </div>
      </div>
      <div className="my-4 flex w-full flex-col items-center justify-center text-lg text-primary-focus md:flex-row md:space-x-4">
        <div className="flex flex-row items-center space-x-4">
          <span className="flex flex-row items-center">
            {t("Fitness")}
            {sortKey === "fitness-asc" && (
              <ArrowUp
                weight={sortKey === "fitness-asc" ? "bold" : "thin"}
                onClick={() => handleSortChange("fitness-asc")}
              />
            )}
            {(sortKey === "fitness-desc" || sortKey.startsWith("rarity")) && (
              <ArrowDown
                weight={sortKey === "fitness-desc" ? "bold" : "thin"}
                onClick={() => handleSortChange("fitness-desc")}
              />
            )}
          </span>
          <span className="flex flex-row items-center">
            {t("Rarity")}
            {sortKey === "rarity-asc" && (
              <ArrowUp
                weight={sortKey === "rarity-asc" ? "bold" : "thin"}
                onClick={() => handleSortChange("rarity-asc")}
              />
            )}
            {(sortKey === "rarity-desc" || sortKey.startsWith("fitness")) && (
              <ArrowDown
                weight={sortKey === "rarity-desc" ? "bold" : "thin"}
                onClick={() => handleSortChange("rarity-desc")}
              />
            )}
          </span>
        </div>
        <div className="flex flex-col items-center space-x-2 md:flex-row">
          <div className="flex flex-row items-center space-x-2">
            <SetSelect set={set} setSet={setSet} />
            <X className="cursor-pointer" onClick={() => setSet(0)} />
          </div>
          <div className="flex flex-row items-center space-x-2">
            <AttributePositionSelect pos={pos} setPos={setPos} />
            <X className="cursor-pointer" onClick={() => setPos(0)} />
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="mt-10 flex flex-col items-center space-y-5">
          <div className="flex flex-row items-center">
            <ReactLoading
              type="bars"
              className="fill-primary"
              style={{ height: 32, width: 32 }}
            />
            <span className="text-xl">{t("Calculating")}</span>
            <ReactLoading
              type="bars"
              className="fill-primary"
              style={{ height: 32, width: 32 }}
            />
          </div>
          <progress
            className="progress progress-primary w-56"
            value={progress}
            max="1"
          ></progress>
        </div>
      ) : (
        <div className="flex flex-col space-y-4">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center px-2">
              {format === "GOOD" && filteredArtifacts.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleDownloadYasLock}
                >
                  {t("Generate")} lock.json
                </button>
              )}
            </div>
            {filteredArtifacts.length > offset && (
              <Paginator
                page={page}
                setPage={setPage}
                offset={offset}
                setOffset={setOffset}
                totalPages={filteredArtifacts.length}
              />
            )}
          </div>
          {filteredArtifacts
            .slice(page * offset, (page + 1) * offset)
            .map((index) => (
              <ArtifactFitnessCard
                key={index}
                index={index}
                artifact={artifacts[index]}
                builds={enabledBuilds}
                fits={allFits[index]}
                rarity={allRarity[index]}
                minFitness={fitness}
                minRarity={rarity}
              />
            ))}
          {filteredArtifacts.length > offset && (
            <Paginator
              page={page}
              setPage={setPage}
              offset={offset}
              setOffset={setOffset}
              totalPages={filteredArtifacts.length}
              scrollToId="main-content"
            />
          )}
          <div className="h-2 w-full"></div>
        </div>
      )}
    </div>
  );
};

export default ArtifactsUpload;
