import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Rxtx Share",
  tagline:
    "Rxtx Share is self-hosted file sharing platform and an alternative for WeTransfer.",
  favicon: "img/rxtxshare.svg",

  url: "https://stonith404.github.io",
  baseUrl: "/rxtx-share/",
  organizationName: "stonith404",
  projectName: "rxtx-share",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/stonith404/rxtx-share/edit/main/docs",
        },
        blog: false,
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/rxtxshare.svg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Rxtx Share",
      logo: {
        alt: "Rxtx Share Logo",
        src: "img/rxtxshare.svg",
      },
      items: [
        {
          href: "https://github.com/stonith404/rxtx-share",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
