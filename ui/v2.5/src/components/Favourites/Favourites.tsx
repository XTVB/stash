import React, { useState } from "react";
import { Tab, Tabs, Dropdown } from "react-bootstrap";
import { useRouteMatch } from "react-router-dom";
import { Helmet } from "react-helmet";
import { FormattedMessage, useIntl } from "react-intl";
import { useTitleProps } from "src/hooks/title";
import { useTabKey } from "src/components/Shared/DetailsPage/Tabs";
import { Icon } from "src/components/Shared/Icon";
import { faCog } from "@fortawesome/free-solid-svg-icons";
import { lazyComponent } from "src/utils/lazyComponent";
import { View } from "src/components/List/views";
import { ListFilterModel } from "src/models/list-filter/filter";
import {
  FavoriteSceneCriterion,
  FavoriteImageCriterion,
  FavoriteGalleryCriterion,
  FavoritePerformerCriterion,
  FavoriteSceneCriterionOption,
  FavoriteImageCriterionOption,
  FavoriteGalleryCriterionOption,
  FavoritePerformerCriterionOption,
} from "src/models/list-filter/criteria/favorite";

const FilteredSceneList = lazyComponent(
  () => import("../Scenes/SceneList")
);
const FilteredImageList = lazyComponent(async () => {
  const m = await import("../Images/ImageList");
  return { default: m.FilteredImageList };
});
const FilteredGalleryList = lazyComponent(async () => {
  const m = await import("../Galleries/GalleryList");
  return { default: m.FilteredGalleryList };
});
const FilteredPerformerList = lazyComponent(async () => {
  const m = await import("../Performers/PerformerList");
  return { default: m.FilteredPerformerList };
});

const validTabs = ["scenes", "images", "galleries", "performers"] as const;
type FavTab = (typeof validTabs)[number];
const STORAGE_KEY = "favourites.defaultTab";

function getDefaultTab(): FavTab {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (validTabs as readonly string[]).includes(stored)) {
    return stored as FavTab;
  }
  return "images";
}

function makeFavoriteFilterHook(
  CriterionClass: new () => { value: string },
  optionObj: { type: string }
) {
  return (filter: ListFilterModel) => {
    if (!filter.criteria.find((c) => c.criterionOption.type === optionObj.type)) {
      const c = new CriterionClass() as any;
      c.value = "true";
      filter.criteria.push(c);
    }
    return filter;
  };
}

const sceneFavoriteHook = makeFavoriteFilterHook(
  FavoriteSceneCriterion,
  FavoriteSceneCriterionOption
);
const imageFavoriteHook = makeFavoriteFilterHook(
  FavoriteImageCriterion,
  FavoriteImageCriterionOption
);
const galleryFavoriteHook = makeFavoriteFilterHook(
  FavoriteGalleryCriterion,
  FavoriteGalleryCriterionOption
);
const performerFavoriteHook = makeFavoriteFilterHook(
  FavoritePerformerCriterion,
  FavoritePerformerCriterionOption
);

const FavouriteTabs: React.FC<{ tabKey?: string }> = ({ tabKey }) => {
  const intl = useIntl();
  const [showSettings, setShowSettings] = useState(false);

  const { setTabKey } = useTabKey({
    tabKey,
    validTabs,
    defaultTabKey: getDefaultTab(),
    baseURL: "/favourites",
  });

  return (
    <>
      <div className="d-flex align-items-center mb-3">
        <h2 className="m-0">
          <FormattedMessage id="favourites" />
        </h2>
        <Dropdown
          show={showSettings}
          onToggle={(isOpen) => setShowSettings(isOpen)}
          className="ml-2"
        >
          <Dropdown.Toggle
            variant="secondary"
            size="sm"
            id="favourites-settings"
          >
            <Icon icon={faCog} />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Header>
              <FormattedMessage
                id="default_tab"
                defaultMessage="Default Tab"
              />
            </Dropdown.Header>
            {validTabs.map((tab) => (
              <Dropdown.Item
                key={tab}
                active={getDefaultTab() === tab}
                onClick={() => {
                  localStorage.setItem(STORAGE_KEY, tab);
                  setShowSettings(false);
                }}
              >
                <FormattedMessage id={tab} />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <Tabs
      id="favourites-tabs"
      mountOnEnter
      unmountOnExit
      activeKey={tabKey}
      onSelect={setTabKey}
    >
      <Tab eventKey="scenes" title={intl.formatMessage({ id: "scenes" })}>
        <FilteredSceneList
          filterHook={sceneFavoriteHook}
          alterQuery={tabKey === "scenes"}
          view={View.FavouriteScenes}
        />
      </Tab>
      <Tab eventKey="images" title={intl.formatMessage({ id: "images" })}>
        <FilteredImageList
          filterHook={imageFavoriteHook}
          alterQuery={tabKey === "images"}
          view={View.FavouriteImages}
        />
      </Tab>
      <Tab
        eventKey="galleries"
        title={intl.formatMessage({ id: "galleries" })}
      >
        <FilteredGalleryList
          filterHook={galleryFavoriteHook}
          alterQuery={tabKey === "galleries"}
          view={View.FavouriteGalleries}
        />
      </Tab>
      <Tab
        eventKey="performers"
        title={intl.formatMessage({ id: "performers" })}
      >
        <FilteredPerformerList
          filterHook={performerFavoriteHook}
          alterQuery={tabKey === "performers"}
          view={View.FavouritePerformers}
        />
      </Tab>
    </Tabs>
    </>
  );
};

const Favourites: React.FC = () => {
  const titleProps = useTitleProps({ id: "favourites" });
  const match = useRouteMatch<{ tab?: string }>("/favourites/:tab?");
  const tabKey = match?.params.tab;

  return (
    <div className="favourites-page">
      <Helmet {...titleProps} />
      <FavouriteTabs tabKey={tabKey} />
    </div>
  );
};

export default Favourites;
