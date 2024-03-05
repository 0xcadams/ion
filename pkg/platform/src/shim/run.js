import * as util from "@pulumi/pulumi";
import * as sst from "../components/";
import { Link } from "../components/link";
import { $config } from "../config";

const $secrets = JSON.parse(process.env.SST_SECRETS || "{}");
const { output, apply, all, interpolate } = util;

const makeLinkable = Link.makeLinkable;
export {
  makeLinkable as "$linkable",
  output as "$output",
  apply as "$apply",
  all as "$all",
  interpolate as "$interpolate",
  util as "$util",
  sst as "sst",
  $config as "$config",
  $secrets as "$secrets",
};
