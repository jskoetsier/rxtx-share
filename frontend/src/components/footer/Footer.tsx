import { Anchor, Footer as MFooter, SimpleGrid, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";

const Footer = () => {
  const t = useTranslate();
  const config = useConfig();
  const hasImprint = !!(
    config.get("legal.imprintUrl") || config.get("legal.imprintText")
  );
  const hasPrivacy = !!(
    config.get("legal.privacyPolicyUrl") ||
    config.get("legal.privacyPolicyText")
  );
  const imprintUrl: string = ((!config.get("legal.imprintText") &&
    String(config.get("legal.imprintUrl"))) ||
    "/imprint") as string;
  const privacyUrl: string = ((!config.get("legal.privacyPolicyText") &&
    String(config.get("legal.privacyPolicyUrl"))) ||
    "/privacy") as string;

  const isMobile = useMediaQuery("(max-width: 700px)");

  return (
    <MFooter height="auto" py={6} px="xl" zIndex={100}>
      <SimpleGrid cols={isMobile ? 2 : 3} m={0}>
        {!isMobile && <div></div>}
        <Text size="xs" color="dimmed" align={isMobile ? "left" : "center"}>
          Powered by{" "}
          <Anchor
            size="xs"
            href="https://github.com/stonith404/rxtx-share"
            target="_blank"
          >
            Rxtx Share
          </Anchor>
        </Text>
        <div>
          {config.get("legal.enabled") === true && (
            <Text size="xs" color="dimmed" align="right">
              {hasImprint && (
                <Anchor size="xs" href={imprintUrl}>
                  {t("imprint.title")}
                </Anchor>
              )}
              {hasImprint && hasPrivacy && " • "}
              {hasPrivacy && (
                <Anchor size="xs" href={privacyUrl}>
                  {t("privacy.title")}
                </Anchor>
              )}
            </Text>
          )}
        </div>
      </SimpleGrid>
    </MFooter>
  );
};

export default Footer;
