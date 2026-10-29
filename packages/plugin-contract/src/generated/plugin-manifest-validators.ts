/* eslint-disable */
// @ts-nocheck -- generated AJV standalone validators intentionally retain emitted JavaScript shapes.
/**
 * Generated from schema/manifest.schema.json.
 * Do not edit directly; run `pnpm run generate`.
 * This standalone validator does not compile Schemas or use eval at Runtime.
 */
import func1Module from 'ajv/dist/runtime/ucs2length.js';
const func1 = typeof func1Module === 'function' ? func1Module : func1Module.default;
"use strict";
export const validateManifest = validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://lensx.app/schemas/plugin/manifest-0.4.0.schema.json","title":"lensX Plugin Manifest 0.4.0","description":"Author-controlled static manifest input for an external lensX plugin.","type":"object","additionalProperties":false,"required":["manifest_version","plugin_id","version","display","publisher","compatibility","runtime","contributes"],"properties":{"manifest_version":{"const":"0.4.0"},"plugin_id":{"$ref":"#/$defs/pluginId"},"version":{"$ref":"#/$defs/semver"},"display":{"$ref":"#/$defs/display"},"publisher":{"$ref":"#/$defs/publisher"},"compatibility":{"$ref":"#/$defs/compatibility"},"runtime":{"$ref":"#/$defs/runtime"},"contributes":{"$ref":"#/$defs/contributes"}},"$defs":{"semver":{"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},"pluginId":{"type":"string","minLength":3,"maxLength":255,"pattern":"^[a-z][a-z0-9_-]{0,63}(?:\\.[a-z][a-z0-9_-]{0,63})+$"},"localId":{"type":"string","minLength":1,"maxLength":64,"pattern":"^[a-z][a-z0-9_-]*$"},"packagePath":{"type":"string","minLength":1,"pattern":"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+$"},"packageHtmlPath":{"type":"string","minLength":6,"pattern":"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+\\.[Hh][Tt][Mm][Ll]$"},"internalRoute":{"type":"string","minLength":1,"pattern":"^/(?!/)(?!.*//)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\\\?#])(?:[^/]+(?:/[^/]+)*)?/?$"},"localizedText":{"type":"object","additionalProperties":false,"required":["en-US"],"properties":{"en-US":{"type":"string","minLength":1},"zh-CN":{"type":"string","minLength":1}}},"localizedKeywords":{"type":"object","additionalProperties":false,"properties":{"en-US":{"type":"array","items":{"type":"string","minLength":1}},"zh-CN":{"type":"array","items":{"type":"string","minLength":1}}}},"asset":{"type":"object","additionalProperties":false,"required":["kind","path"],"properties":{"kind":{"const":"asset"},"path":{"$ref":"#/$defs/packagePath"}}},"display":{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"$ref":"#/$defs/localizedText"},"description":{"$ref":"#/$defs/localizedText"},"icon":{"$ref":"#/$defs/asset"}}},"publisher":{"type":"object","additionalProperties":false,"required":["author","homepage","repository"],"properties":{"author":{"type":"string","minLength":1},"homepage":{"type":"string","minLength":9,"pattern":"^https://"},"repository":{"type":"string","minLength":9,"pattern":"^https://"}}},"versionRange":{"type":"object","additionalProperties":false,"required":["min_version","max_version_exclusive"],"properties":{"min_version":{"$ref":"#/$defs/semver"},"max_version_exclusive":{"$ref":"#/$defs/semver"}}},"compatibility":{"type":"object","additionalProperties":false,"required":["lensx","host_api"],"properties":{"lensx":{"$ref":"#/$defs/versionRange"},"host_api":{"$ref":"#/$defs/versionRange"}}},"runtime":{"type":"object","additionalProperties":false,"required":["kind","entry"],"properties":{"kind":{"const":"webview"},"entry":{"$ref":"#/$defs/packageHtmlPath"}}},"logicalSize":{"type":"object","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":320,"maximum":4096},"height":{"type":"integer","minimum":180,"maximum":4096}}},"pagePresentation":{"type":"object","additionalProperties":false,"required":["initial_size","resizable"],"properties":{"initial_size":{"$ref":"#/$defs/logicalSize"},"resizable":{"type":"boolean"}}},"page":{"type":"object","additionalProperties":false,"required":["id","title","route"],"properties":{"id":{"$ref":"#/$defs/localId"},"title":{"$ref":"#/$defs/localizedText"},"route":{"$ref":"#/$defs/internalRoute"},"parent_page_id":{"$ref":"#/$defs/localId"},"icon":{"$ref":"#/$defs/asset"},"presentation":{"$ref":"#/$defs/pagePresentation"}}},"actionTarget":{"type":"object","additionalProperties":false,"required":["kind","page_id"],"properties":{"kind":{"const":"page"},"page_id":{"$ref":"#/$defs/localId"}}},"action":{"type":"object","additionalProperties":false,"required":["id","title","target"],"properties":{"id":{"$ref":"#/$defs/localId"},"title":{"$ref":"#/$defs/localizedText"},"description":{"$ref":"#/$defs/localizedText"},"default_keywords":{"$ref":"#/$defs/localizedKeywords"},"icon":{"$ref":"#/$defs/asset"},"target":{"$ref":"#/$defs/actionTarget"}}},"launcher":{"type":"object","additionalProperties":false,"required":["default_action_id"],"properties":{"default_action_id":{"$ref":"#/$defs/localId"}}},"contributes":{"type":"object","additionalProperties":false,"required":["pages"],"properties":{"pages":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/page"}},"actions":{"type":"array","items":{"$ref":"#/$defs/action"}},"launcher":{"$ref":"#/$defs/launcher"}}}}};
const schema32 = {"type":"string","minLength":3,"maxLength":255,"pattern":"^[a-z][a-z0-9_-]{0,63}(?:\\.[a-z][a-z0-9_-]{0,63})+$"};
const schema33 = {"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"};
const schema39 = {"type":"object","additionalProperties":false,"required":["author","homepage","repository"],"properties":{"author":{"type":"string","minLength":1},"homepage":{"type":"string","minLength":9,"pattern":"^https://"},"repository":{"type":"string","minLength":9,"pattern":"^https://"}}};
const pattern4 = new RegExp("^[a-z][a-z0-9_-]{0,63}(?:\\.[a-z][a-z0-9_-]{0,63})+$", "u");
const pattern5 = new RegExp("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$", "u");
const pattern7 = new RegExp("^https://", "u");
const schema34 = {"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"$ref":"#/$defs/localizedText"},"description":{"$ref":"#/$defs/localizedText"},"icon":{"$ref":"#/$defs/asset"}}};
const schema35 = {"type":"object","additionalProperties":false,"required":["en-US"],"properties":{"en-US":{"type":"string","minLength":1},"zh-CN":{"type":"string","minLength":1}}};
const schema37 = {"type":"object","additionalProperties":false,"required":["kind","path"],"properties":{"kind":{"const":"asset"},"path":{"$ref":"#/$defs/packagePath"}}};
const schema38 = {"type":"string","minLength":1,"pattern":"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+$"};
const pattern6 = new RegExp("^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+$", "u");

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.path === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "path"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("asset" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.path !== undefined){
let data1 = data.path;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err4 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/packagePath/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern6.test(data1)){
const err5 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/packagePath/pattern",keyword:"pattern",params:{pattern: "^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+$"},message:"must match pattern \""+"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/packagePath/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.name === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "name") || (key0 === "description")) || (key0 === "icon"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if(data0["en-US"] === undefined){
const err2 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/localizedText/required",keyword:"required",params:{missingProperty: "en-US"},message:"must have required property '"+"en-US"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key1 in data0){
if(!((key1 === "en-US") || (key1 === "zh-CN"))){
const err3 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/localizedText/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data0["en-US"] !== undefined){
let data1 = data0["en-US"];
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err4 = {instancePath:instancePath+"/name/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/name/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data0["zh-CN"] !== undefined){
let data2 = data0["zh-CN"];
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err6 = {instancePath:instancePath+"/name/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/name/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/localizedText/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.description !== undefined){
let data3 = data.description;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3["en-US"] === undefined){
const err9 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/required",keyword:"required",params:{missingProperty: "en-US"},message:"must have required property '"+"en-US"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key2 in data3){
if(!((key2 === "en-US") || (key2 === "zh-CN"))){
const err10 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data3["en-US"] !== undefined){
let data4 = data3["en-US"];
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err11 = {instancePath:instancePath+"/description/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/description/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data3["zh-CN"] !== undefined){
let data5 = data3["zh-CN"];
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err13 = {instancePath:instancePath+"/description/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/description/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.icon !== undefined){
if(!(validate22(data.icon, {instancePath:instancePath+"/icon",parentData:data,parentDataProperty:"icon",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema40 = {"type":"object","additionalProperties":false,"required":["lensx","host_api"],"properties":{"lensx":{"$ref":"#/$defs/versionRange"},"host_api":{"$ref":"#/$defs/versionRange"}}};
const schema41 = {"type":"object","additionalProperties":false,"required":["min_version","max_version_exclusive"],"properties":{"min_version":{"$ref":"#/$defs/semver"},"max_version_exclusive":{"$ref":"#/$defs/semver"}}};

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.min_version === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "min_version"},message:"must have required property '"+"min_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.max_version_exclusive === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "max_version_exclusive"},message:"must have required property '"+"max_version_exclusive"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "min_version") || (key0 === "max_version_exclusive"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.min_version !== undefined){
let data0 = data.min_version;
if(typeof data0 === "string"){
if(!pattern5.test(data0)){
const err3 = {instancePath:instancePath+"/min_version",schemaPath:"#/$defs/semver/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/min_version",schemaPath:"#/$defs/semver/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.max_version_exclusive !== undefined){
let data1 = data.max_version_exclusive;
if(typeof data1 === "string"){
if(!pattern5.test(data1)){
const err5 = {instancePath:instancePath+"/max_version_exclusive",schemaPath:"#/$defs/semver/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/max_version_exclusive",schemaPath:"#/$defs/semver/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.lensx === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lensx"},message:"must have required property '"+"lensx"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.host_api === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "host_api"},message:"must have required property '"+"host_api"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "lensx") || (key0 === "host_api"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.lensx !== undefined){
if(!(validate26(data.lensx, {instancePath:instancePath+"/lensx",parentData:data,parentDataProperty:"lensx",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.host_api !== undefined){
if(!(validate26(data.host_api, {instancePath:instancePath+"/host_api",parentData:data,parentDataProperty:"host_api",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema44 = {"type":"object","additionalProperties":false,"required":["kind","entry"],"properties":{"kind":{"const":"webview"},"entry":{"$ref":"#/$defs/packageHtmlPath"}}};
const schema45 = {"type":"string","minLength":6,"pattern":"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+\\.[Hh][Tt][Mm][Ll]$"};
const pattern11 = new RegExp("^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+\\.[Hh][Tt][Mm][Ll]$", "u");

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.entry === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "entry"},message:"must have required property '"+"entry"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "entry"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("webview" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "webview"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.entry !== undefined){
let data1 = data.entry;
if(typeof data1 === "string"){
if(func1(data1) < 6){
const err4 = {instancePath:instancePath+"/entry",schemaPath:"#/$defs/packageHtmlPath/minLength",keyword:"minLength",params:{limit: 6},message:"must NOT have fewer than 6 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern11.test(data1)){
const err5 = {instancePath:instancePath+"/entry",schemaPath:"#/$defs/packageHtmlPath/pattern",keyword:"pattern",params:{pattern: "^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+\\.[Hh][Tt][Mm][Ll]$"},message:"must match pattern \""+"^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*//)(?!.*[\\\\?#:])\\S+\\.[Hh][Tt][Mm][Ll]$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/entry",schemaPath:"#/$defs/packageHtmlPath/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema46 = {"type":"object","additionalProperties":false,"required":["pages"],"properties":{"pages":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/page"}},"actions":{"type":"array","items":{"$ref":"#/$defs/action"}},"launcher":{"$ref":"#/$defs/launcher"}}};
const schema47 = {"type":"object","additionalProperties":false,"required":["id","title","route"],"properties":{"id":{"$ref":"#/$defs/localId"},"title":{"$ref":"#/$defs/localizedText"},"route":{"$ref":"#/$defs/internalRoute"},"parent_page_id":{"$ref":"#/$defs/localId"},"icon":{"$ref":"#/$defs/asset"},"presentation":{"$ref":"#/$defs/pagePresentation"}}};
const schema48 = {"type":"string","minLength":1,"maxLength":64,"pattern":"^[a-z][a-z0-9_-]*$"};
const schema50 = {"type":"string","minLength":1,"pattern":"^/(?!/)(?!.*//)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\\\?#])(?:[^/]+(?:/[^/]+)*)?/?$"};
const pattern12 = new RegExp("^[a-z][a-z0-9_-]*$", "u");
const pattern13 = new RegExp("^/(?!/)(?!.*//)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\\\?#])(?:[^/]+(?:/[^/]+)*)?/?$", "u");
const schema52 = {"type":"object","additionalProperties":false,"required":["initial_size","resizable"],"properties":{"initial_size":{"$ref":"#/$defs/logicalSize"},"resizable":{"type":"boolean"}}};
const schema53 = {"type":"object","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":320,"maximum":4096},"height":{"type":"integer","minimum":180,"maximum":4096}}};

function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate35.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.initial_size === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "initial_size"},message:"must have required property '"+"initial_size"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.resizable === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resizable"},message:"must have required property '"+"resizable"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "initial_size") || (key0 === "resizable"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.initial_size !== undefined){
let data0 = data.initial_size;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if(data0.width === undefined){
const err3 = {instancePath:instancePath+"/initial_size",schemaPath:"#/$defs/logicalSize/required",keyword:"required",params:{missingProperty: "width"},message:"must have required property '"+"width"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.height === undefined){
const err4 = {instancePath:instancePath+"/initial_size",schemaPath:"#/$defs/logicalSize/required",keyword:"required",params:{missingProperty: "height"},message:"must have required property '"+"height"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data0){
if(!((key1 === "width") || (key1 === "height"))){
const err5 = {instancePath:instancePath+"/initial_size",schemaPath:"#/$defs/logicalSize/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data0.width !== undefined){
let data1 = data0.width;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err6 = {instancePath:instancePath+"/initial_size/width",schemaPath:"#/$defs/logicalSize/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 4096 || isNaN(data1)){
const err7 = {instancePath:instancePath+"/initial_size/width",schemaPath:"#/$defs/logicalSize/properties/width/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1 < 320 || isNaN(data1)){
const err8 = {instancePath:instancePath+"/initial_size/width",schemaPath:"#/$defs/logicalSize/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 320},message:"must be >= 320"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
if(data0.height !== undefined){
let data2 = data0.height;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err9 = {instancePath:instancePath+"/initial_size/height",schemaPath:"#/$defs/logicalSize/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 4096 || isNaN(data2)){
const err10 = {instancePath:instancePath+"/initial_size/height",schemaPath:"#/$defs/logicalSize/properties/height/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data2 < 180 || isNaN(data2)){
const err11 = {instancePath:instancePath+"/initial_size/height",schemaPath:"#/$defs/logicalSize/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 180},message:"must be >= 180"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
}
else {
const err12 = {instancePath:instancePath+"/initial_size",schemaPath:"#/$defs/logicalSize/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.resizable !== undefined){
if(typeof data.resizable !== "boolean"){
const err13 = {instancePath:instancePath+"/resizable",schemaPath:"#/properties/resizable/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate35.errors = vErrors;
return errors === 0;
}
validate35.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.route === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "route"},message:"must have required property '"+"route"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "title")) || (key0 === "route")) || (key0 === "parent_page_id")) || (key0 === "icon")) || (key0 === "presentation"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) > 64){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern12.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.title !== undefined){
let data1 = data.title;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1["en-US"] === undefined){
const err8 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/required",keyword:"required",params:{missingProperty: "en-US"},message:"must have required property '"+"en-US"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "en-US") || (key1 === "zh-CN"))){
const err9 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1["en-US"] !== undefined){
let data2 = data1["en-US"];
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err10 = {instancePath:instancePath+"/title/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/title/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1["zh-CN"] !== undefined){
let data3 = data1["zh-CN"];
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err12 = {instancePath:instancePath+"/title/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/title/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.route !== undefined){
let data4 = data.route;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err15 = {instancePath:instancePath+"/route",schemaPath:"#/$defs/internalRoute/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern13.test(data4)){
const err16 = {instancePath:instancePath+"/route",schemaPath:"#/$defs/internalRoute/pattern",keyword:"pattern",params:{pattern: "^/(?!/)(?!.*//)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\\\?#])(?:[^/]+(?:/[^/]+)*)?/?$"},message:"must match pattern \""+"^/(?!/)(?!.*//)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\\\?#])(?:[^/]+(?:/[^/]+)*)?/?$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/route",schemaPath:"#/$defs/internalRoute/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.parent_page_id !== undefined){
let data5 = data.parent_page_id;
if(typeof data5 === "string"){
if(func1(data5) > 64){
const err18 = {instancePath:instancePath+"/parent_page_id",schemaPath:"#/$defs/localId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func1(data5) < 1){
const err19 = {instancePath:instancePath+"/parent_page_id",schemaPath:"#/$defs/localId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern12.test(data5)){
const err20 = {instancePath:instancePath+"/parent_page_id",schemaPath:"#/$defs/localId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/parent_page_id",schemaPath:"#/$defs/localId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.icon !== undefined){
if(!(validate22(data.icon, {instancePath:instancePath+"/icon",parentData:data,parentDataProperty:"icon",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
if(data.presentation !== undefined){
if(!(validate35(data.presentation, {instancePath:instancePath+"/presentation",parentData:data,parentDataProperty:"presentation",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
errors = vErrors.length;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate33.errors = vErrors;
return errors === 0;
}
validate33.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema54 = {"type":"object","additionalProperties":false,"required":["id","title","target"],"properties":{"id":{"$ref":"#/$defs/localId"},"title":{"$ref":"#/$defs/localizedText"},"description":{"$ref":"#/$defs/localizedText"},"default_keywords":{"$ref":"#/$defs/localizedKeywords"},"icon":{"$ref":"#/$defs/asset"},"target":{"$ref":"#/$defs/actionTarget"}}};
const schema58 = {"type":"object","additionalProperties":false,"properties":{"en-US":{"type":"array","items":{"type":"string","minLength":1}},"zh-CN":{"type":"array","items":{"type":"string","minLength":1}}}};
const schema59 = {"type":"object","additionalProperties":false,"required":["kind","page_id"],"properties":{"kind":{"const":"page"},"page_id":{"$ref":"#/$defs/localId"}}};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.page_id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "page_id"},message:"must have required property '"+"page_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "page_id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("page" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "page"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.page_id !== undefined){
let data1 = data.page_id;
if(typeof data1 === "string"){
if(func1(data1) > 64){
const err4 = {instancePath:instancePath+"/page_id",schemaPath:"#/$defs/localId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data1) < 1){
const err5 = {instancePath:instancePath+"/page_id",schemaPath:"#/$defs/localId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern12.test(data1)){
const err6 = {instancePath:instancePath+"/page_id",schemaPath:"#/$defs/localId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/page_id",schemaPath:"#/$defs/localId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.target === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "target"},message:"must have required property '"+"target"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "title")) || (key0 === "description")) || (key0 === "default_keywords")) || (key0 === "icon")) || (key0 === "target"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) > 64){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data0) < 1){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern12.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/localId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.title !== undefined){
let data1 = data.title;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1["en-US"] === undefined){
const err8 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/required",keyword:"required",params:{missingProperty: "en-US"},message:"must have required property '"+"en-US"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "en-US") || (key1 === "zh-CN"))){
const err9 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1["en-US"] !== undefined){
let data2 = data1["en-US"];
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err10 = {instancePath:instancePath+"/title/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/title/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1["zh-CN"] !== undefined){
let data3 = data1["zh-CN"];
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err12 = {instancePath:instancePath+"/title/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/title/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/localizedText/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.description !== undefined){
let data4 = data.description;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4["en-US"] === undefined){
const err15 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/required",keyword:"required",params:{missingProperty: "en-US"},message:"must have required property '"+"en-US"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key2 in data4){
if(!((key2 === "en-US") || (key2 === "zh-CN"))){
const err16 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data4["en-US"] !== undefined){
let data5 = data4["en-US"];
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err17 = {instancePath:instancePath+"/description/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/description/en-US",schemaPath:"#/$defs/localizedText/properties/en-US/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data4["zh-CN"] !== undefined){
let data6 = data4["zh-CN"];
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err19 = {instancePath:instancePath+"/description/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/description/zh-CN",schemaPath:"#/$defs/localizedText/properties/zh-CN/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/description",schemaPath:"#/$defs/localizedText/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.default_keywords !== undefined){
let data7 = data.default_keywords;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
for(const key3 in data7){
if(!((key3 === "en-US") || (key3 === "zh-CN"))){
const err22 = {instancePath:instancePath+"/default_keywords",schemaPath:"#/$defs/localizedKeywords/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data7["en-US"] !== undefined){
let data8 = data7["en-US"];
if(Array.isArray(data8)){
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
let data9 = data8[i0];
if(typeof data9 === "string"){
if(func1(data9) < 1){
const err23 = {instancePath:instancePath+"/default_keywords/en-US/" + i0,schemaPath:"#/$defs/localizedKeywords/properties/en-US/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/default_keywords/en-US/" + i0,schemaPath:"#/$defs/localizedKeywords/properties/en-US/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/default_keywords/en-US",schemaPath:"#/$defs/localizedKeywords/properties/en-US/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data7["zh-CN"] !== undefined){
let data10 = data7["zh-CN"];
if(Array.isArray(data10)){
const len1 = data10.length;
for(let i1=0; i1<len1; i1++){
let data11 = data10[i1];
if(typeof data11 === "string"){
if(func1(data11) < 1){
const err26 = {instancePath:instancePath+"/default_keywords/zh-CN/" + i1,schemaPath:"#/$defs/localizedKeywords/properties/zh-CN/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/default_keywords/zh-CN/" + i1,schemaPath:"#/$defs/localizedKeywords/properties/zh-CN/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/default_keywords/zh-CN",schemaPath:"#/$defs/localizedKeywords/properties/zh-CN/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/default_keywords",schemaPath:"#/$defs/localizedKeywords/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.icon !== undefined){
if(!(validate22(data.icon, {instancePath:instancePath+"/icon",parentData:data,parentDataProperty:"icon",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
if(data.target !== undefined){
if(!(validate40(data.target, {instancePath:instancePath+"/target",parentData:data,parentDataProperty:"target",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema61 = {"type":"object","additionalProperties":false,"required":["default_action_id"],"properties":{"default_action_id":{"$ref":"#/$defs/localId"}}};

function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate43.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.default_action_id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "default_action_id"},message:"must have required property '"+"default_action_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "default_action_id")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.default_action_id !== undefined){
let data0 = data.default_action_id;
if(typeof data0 === "string"){
if(func1(data0) > 64){
const err2 = {instancePath:instancePath+"/default_action_id",schemaPath:"#/$defs/localId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func1(data0) < 1){
const err3 = {instancePath:instancePath+"/default_action_id",schemaPath:"#/$defs/localId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!pattern12.test(data0)){
const err4 = {instancePath:instancePath+"/default_action_id",schemaPath:"#/$defs/localId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/default_action_id",schemaPath:"#/$defs/localId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate43.errors = vErrors;
return errors === 0;
}
validate43.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.pages === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "pages"},message:"must have required property '"+"pages"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "pages") || (key0 === "actions")) || (key0 === "launcher"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.pages !== undefined){
let data0 = data.pages;
if(Array.isArray(data0)){
if(data0.length < 1){
const err2 = {instancePath:instancePath+"/pages",schemaPath:"#/properties/pages/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
if(!(validate33(data0[i0], {instancePath:instancePath+"/pages/" + i0,parentData:data0,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
errors = vErrors.length;
}
}
}
else {
const err3 = {instancePath:instancePath+"/pages",schemaPath:"#/properties/pages/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.actions !== undefined){
let data2 = data.actions;
if(Array.isArray(data2)){
const len1 = data2.length;
for(let i1=0; i1<len1; i1++){
if(!(validate38(data2[i1], {instancePath:instancePath+"/actions/" + i1,parentData:data2,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath:instancePath+"/actions",schemaPath:"#/properties/actions/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.launcher !== undefined){
if(!(validate43(data.launcher, {instancePath:instancePath+"/launcher",parentData:data,parentDataProperty:"launcher",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate32.errors = vErrors;
return errors === 0;
}
validate32.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://lensx.app/schemas/plugin/manifest-0.4.0.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.manifest_version === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "manifest_version"},message:"must have required property '"+"manifest_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.plugin_id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plugin_id"},message:"must have required property '"+"plugin_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.version === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.display === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "display"},message:"must have required property '"+"display"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.publisher === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "publisher"},message:"must have required property '"+"publisher"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.compatibility === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "compatibility"},message:"must have required property '"+"compatibility"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.runtime === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "runtime"},message:"must have required property '"+"runtime"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.contributes === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contributes"},message:"must have required property '"+"contributes"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "manifest_version") || (key0 === "plugin_id")) || (key0 === "version")) || (key0 === "display")) || (key0 === "publisher")) || (key0 === "compatibility")) || (key0 === "runtime")) || (key0 === "contributes"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.manifest_version !== undefined){
if("0.4.0" !== data.manifest_version){
const err9 = {instancePath:instancePath+"/manifest_version",schemaPath:"#/properties/manifest_version/const",keyword:"const",params:{allowedValue: "0.4.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.plugin_id !== undefined){
let data1 = data.plugin_id;
if(typeof data1 === "string"){
if(func1(data1) > 255){
const err10 = {instancePath:instancePath+"/plugin_id",schemaPath:"#/$defs/pluginId/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func1(data1) < 3){
const err11 = {instancePath:instancePath+"/plugin_id",schemaPath:"#/$defs/pluginId/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern4.test(data1)){
const err12 = {instancePath:instancePath+"/plugin_id",schemaPath:"#/$defs/pluginId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]{0,63}(?:\\.[a-z][a-z0-9_-]{0,63})+$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]{0,63}(?:\\.[a-z][a-z0-9_-]{0,63})+$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/plugin_id",schemaPath:"#/$defs/pluginId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.version !== undefined){
let data2 = data.version;
if(typeof data2 === "string"){
if(!pattern5.test(data2)){
const err14 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/semver/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/semver/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.display !== undefined){
if(!(validate21(data.display, {instancePath:instancePath+"/display",parentData:data,parentDataProperty:"display",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data.publisher !== undefined){
let data4 = data.publisher;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.author === undefined){
const err16 = {instancePath:instancePath+"/publisher",schemaPath:"#/$defs/publisher/required",keyword:"required",params:{missingProperty: "author"},message:"must have required property '"+"author"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data4.homepage === undefined){
const err17 = {instancePath:instancePath+"/publisher",schemaPath:"#/$defs/publisher/required",keyword:"required",params:{missingProperty: "homepage"},message:"must have required property '"+"homepage"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data4.repository === undefined){
const err18 = {instancePath:instancePath+"/publisher",schemaPath:"#/$defs/publisher/required",keyword:"required",params:{missingProperty: "repository"},message:"must have required property '"+"repository"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key1 in data4){
if(!(((key1 === "author") || (key1 === "homepage")) || (key1 === "repository"))){
const err19 = {instancePath:instancePath+"/publisher",schemaPath:"#/$defs/publisher/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data4.author !== undefined){
let data5 = data4.author;
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err20 = {instancePath:instancePath+"/publisher/author",schemaPath:"#/$defs/publisher/properties/author/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/publisher/author",schemaPath:"#/$defs/publisher/properties/author/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data4.homepage !== undefined){
let data6 = data4.homepage;
if(typeof data6 === "string"){
if(func1(data6) < 9){
const err22 = {instancePath:instancePath+"/publisher/homepage",schemaPath:"#/$defs/publisher/properties/homepage/minLength",keyword:"minLength",params:{limit: 9},message:"must NOT have fewer than 9 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern7.test(data6)){
const err23 = {instancePath:instancePath+"/publisher/homepage",schemaPath:"#/$defs/publisher/properties/homepage/pattern",keyword:"pattern",params:{pattern: "^https://"},message:"must match pattern \""+"^https://"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/publisher/homepage",schemaPath:"#/$defs/publisher/properties/homepage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data4.repository !== undefined){
let data7 = data4.repository;
if(typeof data7 === "string"){
if(func1(data7) < 9){
const err25 = {instancePath:instancePath+"/publisher/repository",schemaPath:"#/$defs/publisher/properties/repository/minLength",keyword:"minLength",params:{limit: 9},message:"must NOT have fewer than 9 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!pattern7.test(data7)){
const err26 = {instancePath:instancePath+"/publisher/repository",schemaPath:"#/$defs/publisher/properties/repository/pattern",keyword:"pattern",params:{pattern: "^https://"},message:"must match pattern \""+"^https://"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/publisher/repository",schemaPath:"#/$defs/publisher/properties/repository/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/publisher",schemaPath:"#/$defs/publisher/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.compatibility !== undefined){
if(!(validate25(data.compatibility, {instancePath:instancePath+"/compatibility",parentData:data,parentDataProperty:"compatibility",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.runtime !== undefined){
if(!(validate30(data.runtime, {instancePath:instancePath+"/runtime",parentData:data,parentDataProperty:"runtime",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.contributes !== undefined){
if(!(validate32(data.contributes, {instancePath:instancePath+"/contributes",parentData:data,parentDataProperty:"contributes",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
errors = vErrors.length;
}
}
}
else {
const err29 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

