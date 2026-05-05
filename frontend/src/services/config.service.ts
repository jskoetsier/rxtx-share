import axios from "axios";
import Config, {
  AdminConfig,
  ParsedConfigValue,
  UpdateConfig,
} from "../types/config.type";
import { parseConfigValue } from "../utils/parse-config-value";
import api from "./api.service";

const list = async (): Promise<Config[]> => {
  return (await api.get("/configs")).data;
};

const getByCategory = async (category: string): Promise<AdminConfig[]> => {
  return (await api.get(`/configs/admin/${category}`)).data;
};

const updateMany = async (data: UpdateConfig[]): Promise<AdminConfig[]> => {
  return (await api.patch("/configs/admin", data)).data;
};

const get = (key: string, configVariables: Config[]): ParsedConfigValue =>
  parseConfigValue(key, configVariables);

const finishSetup = async (): Promise<AdminConfig[]> => {
  return (await api.post("/configs/admin/finishSetup")).data;
};

const sendTestEmail = async (email: string) => {
  await api.post("/configs/admin/testEmail", { email });
};

const isNewReleaseAvailable = async () => {
  const response = (
    await axios.get(
      "https://api.github.com/repos/stonith404/rxtx-share/releases/latest",
    )
  ).data;
  return response.tag_name.replace("v", "") != process.env.VERSION;
};

const changeLogo = async (file: File) => {
  const form = new FormData();
  form.append("file", file);

  await api.post("/configs/admin/logo", form);
};
export default {
  list,
  getByCategory,
  updateMany,
  get,
  finishSetup,
  sendTestEmail,
  isNewReleaseAvailable,
  changeLogo,
};
