/* eslint-disable */
// @ts-nocheck -- generated AJV standalone validators intentionally retain emitted JavaScript shapes.
/**
 * Generated from schema/host-api.schema.json.
 * Do not edit directly; run `pnpm run generate`.
 * These standalone validators do not compile Schemas or use eval at Runtime.
 */
import func1Module from 'ajv/dist/runtime/ucs2length.js';
const func1 = typeof func1Module === 'function' ? func1Module : func1Module.default;
import func0Module from 'ajv/dist/runtime/equal.js';
const func0 = typeof func0Module === 'function' ? func0Module : func0Module.default;
"use strict";
export const ActionsOpenRequest = validate20;
const schema31 = {"$id":"urn:lensx:plugin-host-api-validator:ActionsOpenRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenRequest"};
const schema34 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"actions.open"},"params":{"type":"object","additionalProperties":false,"required":["actionId"],"properties":{"actionId":{"$ref":"#/$defs/LocalActionId"}}}}};
const schema35 = {"type":"string","minLength":1,"maxLength":64,"pattern":"^[a-z][a-z0-9_-]*$"};
const pattern4 = new RegExp("^[a-z][a-z0-9_-]*$", "u");

function validate65(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate65.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("actions.open" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "actions.open"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.actionId === undefined){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "actionId"},message:"must have required property '"+"actionId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "actionId")){
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.actionId !== undefined){
let data2 = data1.actionId;
if(typeof data2 === "string"){
if(func1(data2) > 64){
const err6 = {instancePath:instancePath+"/params/actionId",schemaPath:"#/$defs/LocalActionId/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/params/actionId",schemaPath:"#/$defs/LocalActionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!pattern4.test(data2)){
const err8 = {instancePath:instancePath+"/params/actionId",schemaPath:"#/$defs/LocalActionId/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_-]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_-]*$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/params/actionId",schemaPath:"#/$defs/LocalActionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate65.errors = vErrors;
return errors === 0;
}
validate65.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ActionsOpenRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate65(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate65.errors : vErrors.concat(validate65.errors);
errors = vErrors.length;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const ActionsOpenResult = validate67;
const schema79 = {"$id":"urn:lensx:plugin-host-api-validator:ActionsOpenResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult"};
const schema56 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"actions.open"},"result":{"type":"object","additionalProperties":false,"required":["opened"],"properties":{"opened":{"const":true}}}}};

function validate67(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ActionsOpenResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate67.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("actions.open" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/properties/method/const",keyword:"const",params:{allowedValue: "actions.open"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.opened === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/properties/result/required",keyword:"required",params:{missingProperty: "opened"},message:"must have required property '"+"opened"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "opened")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.opened !== undefined){
if(true !== data1.opened){
const err6 = {instancePath:instancePath+"/result/opened",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/properties/result/properties/opened/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err8 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ActionsOpenResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate67.errors = vErrors;
return errors === 0;
}
validate67.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const ClipboardReadRequest = validate68;
const schema81 = {"$id":"urn:lensx:plugin-host-api-validator:ClipboardReadRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardReadRequest"};
const schema36 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"clipboard.read"},"params":{"$ref":"#/$defs/EmptyParams"}}};
const schema37 = {"type":"object","additionalProperties":false};

function validate69(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate69.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("clipboard.read" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "clipboard.read"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
validate69.errors = vErrors;
return errors === 0;
}
validate69.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate68(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ClipboardReadRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate68.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate69(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
errors = vErrors.length;
}
validate68.errors = vErrors;
return errors === 0;
}
validate68.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const ClipboardReadResult = validate71;
const schema84 = {"$id":"urn:lensx:plugin-host-api-validator:ClipboardReadResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardReadResult"};
const schema57 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"clipboard.read"},"result":{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"$ref":"#/$defs/BoundedText"}}}}};
const schema39 = {"type":"string","maxLength":1048576};

function validate72(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate72.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
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
if(data.method !== undefined){
if("clipboard.read" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "clipboard.read"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.text === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "text")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.text !== undefined){
let data2 = data1.text;
if(typeof data2 === "string"){
if(func1(data2) > 1048576){
const err6 = {instancePath:instancePath+"/result/text",schemaPath:"#/$defs/BoundedText/maxLength",keyword:"maxLength",params:{limit: 1048576},message:"must NOT have more than 1048576 characters"};
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
const err7 = {instancePath:instancePath+"/result/text",schemaPath:"#/$defs/BoundedText/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err8 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate72.errors = vErrors;
return errors === 0;
}
validate72.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ClipboardReadResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate71.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate72(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
errors = vErrors.length;
}
validate71.errors = vErrors;
return errors === 0;
}
validate71.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const ClipboardWriteRequest = validate74;
const schema87 = {"$id":"urn:lensx:plugin-host-api-validator:ClipboardWriteRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteRequest"};
const schema38 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"clipboard.write"},"params":{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"$ref":"#/$defs/BoundedText"}}}}};

function validate75(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate75.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("clipboard.write" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "clipboard.write"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.text === undefined){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "text")){
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.text !== undefined){
let data2 = data1.text;
if(typeof data2 === "string"){
if(func1(data2) > 1048576){
const err6 = {instancePath:instancePath+"/params/text",schemaPath:"#/$defs/BoundedText/maxLength",keyword:"maxLength",params:{limit: 1048576},message:"must NOT have more than 1048576 characters"};
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
const err7 = {instancePath:instancePath+"/params/text",schemaPath:"#/$defs/BoundedText/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err8 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate75.errors = vErrors;
return errors === 0;
}
validate75.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate74(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ClipboardWriteRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate74.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate75(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate75.errors : vErrors.concat(validate75.errors);
errors = vErrors.length;
}
validate74.errors = vErrors;
return errors === 0;
}
validate74.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const ClipboardWriteResult = validate77;
const schema90 = {"$id":"urn:lensx:plugin-host-api-validator:ClipboardWriteResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult"};
const schema59 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"clipboard.write"},"result":{"type":"object","additionalProperties":false,"required":["written"],"properties":{"written":{"const":true}}}}};

function validate77(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:ClipboardWriteResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate77.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("clipboard.write" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/properties/method/const",keyword:"const",params:{allowedValue: "clipboard.write"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.written === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/properties/result/required",keyword:"required",params:{missingProperty: "written"},message:"must have required property '"+"written"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "written")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.written !== undefined){
if(true !== data1.written){
const err6 = {instancePath:instancePath+"/result/written",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/properties/result/properties/written/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err8 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/ClipboardWriteResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate77.errors = vErrors;
return errors === 0;
}
validate77.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const RuntimeGetContextRequest = validate78;
const schema92 = {"$id":"urn:lensx:plugin-host-api-validator:RuntimeGetContextRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/RuntimeGetContextRequest"};
const schema40 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"runtime.get_context"},"params":{"$ref":"#/$defs/EmptyParams"}}};

function validate79(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate79.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("runtime.get_context" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "runtime.get_context"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
validate79.errors = vErrors;
return errors === 0;
}
validate79.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate78(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:RuntimeGetContextRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate78.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate79(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
errors = vErrors.length;
}
validate78.errors = vErrors;
return errors === 0;
}
validate78.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const RuntimeGetContextResult = validate81;
const schema95 = {"$id":"urn:lensx:plugin-host-api-validator:RuntimeGetContextResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/RuntimeGetContextResult"};
const schema60 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"runtime.get_context"},"result":{"$ref":"#/$defs/PluginRuntimeContextInput"}}};
const schema61 = {"type":"object","additionalProperties":false,"required":["hostApiVersion","locale","theme","capabilities"],"properties":{"hostApiVersion":{"$ref":"#/$defs/Semver"},"locale":{"type":"string","enum":["en-US","zh-CN"]},"theme":{"type":"string","enum":["light","dark"]},"capabilities":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/HostApiMethodInput"}}}};
const schema62 = {"type":"string","maxLength":255,"pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"};
const schema63 = {"type":"string","enum":["actions.open","clipboard.read","clipboard.write","runtime.get_context","storage.delete","storage.get","storage.get_quota","storage.list","storage.set","ui.close"]};
const pattern8 = new RegExp("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$", "u");

function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate50.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.hostApiVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hostApiVersion"},message:"must have required property '"+"hostApiVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.locale === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locale"},message:"must have required property '"+"locale"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.theme === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "theme"},message:"must have required property '"+"theme"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.capabilities === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "capabilities"},message:"must have required property '"+"capabilities"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "hostApiVersion") || (key0 === "locale")) || (key0 === "theme")) || (key0 === "capabilities"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hostApiVersion !== undefined){
let data0 = data.hostApiVersion;
if(typeof data0 === "string"){
if(func1(data0) > 255){
const err5 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern8.test(data0)){
const err6 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"+"\""};
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
const err7 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.locale !== undefined){
let data1 = data.locale;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!((data1 === "en-US") || (data1 === "zh-CN"))){
const err9 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/enum",keyword:"enum",params:{allowedValues: schema61.properties.locale.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.theme !== undefined){
let data2 = data.theme;
if(typeof data2 !== "string"){
const err10 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!((data2 === "light") || (data2 === "dark"))){
const err11 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/enum",keyword:"enum",params:{allowedValues: schema61.properties.theme.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.capabilities !== undefined){
let data3 = data.capabilities;
if(Array.isArray(data3)){
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/capabilities/" + i0,schemaPath:"#/$defs/HostApiMethodInput/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((((((((data4 === "actions.open") || (data4 === "clipboard.read")) || (data4 === "clipboard.write")) || (data4 === "runtime.get_context")) || (data4 === "storage.delete")) || (data4 === "storage.get")) || (data4 === "storage.get_quota")) || (data4 === "storage.list")) || (data4 === "storage.set")) || (data4 === "ui.close"))){
const err13 = {instancePath:instancePath+"/capabilities/" + i0,schemaPath:"#/$defs/HostApiMethodInput/enum",keyword:"enum",params:{allowedValues: schema63.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
const err14 = {instancePath:instancePath+"/capabilities",schemaPath:"#/properties/capabilities/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err15 = {instancePath:instancePath+"/capabilities",schemaPath:"#/properties/capabilities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
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
validate50.errors = vErrors;
return errors === 0;
}
validate50.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate82(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate82.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
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
if(data.method !== undefined){
if("runtime.get_context" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "runtime.get_context"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
if(!(validate50(data.result, {instancePath:instancePath+"/result",parentData:data,parentDataProperty:"result",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate82.errors = vErrors;
return errors === 0;
}
validate82.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate81(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:RuntimeGetContextResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate81.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate82(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate82.errors : vErrors.concat(validate82.errors);
errors = vErrors.length;
}
validate81.errors = vErrors;
return errors === 0;
}
validate81.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageDeleteRequest = validate85;
const schema97 = {"$id":"urn:lensx:plugin-host-api-validator:StorageDeleteRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteRequest"};
const schema42 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"storage.delete"},"params":{"type":"object","additionalProperties":false,"required":["key"],"properties":{"key":{"$ref":"#/$defs/StorageKey"}}}}};
const schema43 = {"type":"string","minLength":1,"maxLength":256,"pattern":"^[^\\u0000-\\u001F\\u007F]+$"};
const pattern5 = new RegExp("^[^\\u0000-\\u001F\\u007F]+$", "u");

function validate86(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate86.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("storage.delete" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.delete"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.key === undefined){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "key")){
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.key !== undefined){
let data2 = data1.key;
if(typeof data2 === "string"){
if(func1(data2) > 256){
const err6 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!pattern5.test(data2)){
const err8 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/pattern",keyword:"pattern",params:{pattern: "^[^\\u0000-\\u001F\\u007F]+$"},message:"must match pattern \""+"^[^\\u0000-\\u001F\\u007F]+$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate86.errors = vErrors;
return errors === 0;
}
validate86.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate85(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageDeleteRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate85.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate86(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
errors = vErrors.length;
}
validate85.errors = vErrors;
return errors === 0;
}
validate85.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageDeleteResult = validate88;
const schema100 = {"$id":"urn:lensx:plugin-host-api-validator:StorageDeleteResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult"};
const schema64 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"storage.delete"},"result":{"type":"object","additionalProperties":false,"required":["deleted"],"properties":{"deleted":{"type":"boolean"}}}}};

function validate88(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageDeleteResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate88.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("storage.delete" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/properties/method/const",keyword:"const",params:{allowedValue: "storage.delete"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.deleted === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/properties/result/required",keyword:"required",params:{missingProperty: "deleted"},message:"must have required property '"+"deleted"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "deleted")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.deleted !== undefined){
if(typeof data1.deleted !== "boolean"){
const err6 = {instancePath:instancePath+"/result/deleted",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/properties/result/properties/deleted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err8 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageDeleteResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate88.errors = vErrors;
return errors === 0;
}
validate88.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageGetRequest = validate89;
const schema102 = {"$id":"urn:lensx:plugin-host-api-validator:StorageGetRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetRequest"};
const schema44 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"storage.get"},"params":{"type":"object","additionalProperties":false,"required":["key"],"properties":{"key":{"$ref":"#/$defs/StorageKey"}}}}};

function validate90(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate90.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("storage.get" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.get"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.key === undefined){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "key")){
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.key !== undefined){
let data2 = data1.key;
if(typeof data2 === "string"){
if(func1(data2) > 256){
const err6 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!pattern5.test(data2)){
const err8 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/pattern",keyword:"pattern",params:{pattern: "^[^\\u0000-\\u001F\\u007F]+$"},message:"must match pattern \""+"^[^\\u0000-\\u001F\\u007F]+$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate90.errors = vErrors;
return errors === 0;
}
validate90.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate89(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageGetRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate89.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate90(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
errors = vErrors.length;
}
validate89.errors = vErrors;
return errors === 0;
}
validate89.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageGetResult = validate92;
const schema105 = {"$id":"urn:lensx:plugin-host-api-validator:StorageGetResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetResult"};
const schema65 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"storage.get"},"result":{"oneOf":[{"type":"object","additionalProperties":false,"required":["found"],"properties":{"found":{"const":false}}},{"type":"object","additionalProperties":false,"required":["found","value"],"properties":{"found":{"const":true},"value":{"$ref":"#/$defs/JsonValue"}}}]}}};
const schema52 = {"anyOf":[{"type":"null"},{"type":"boolean"},{"type":"string"},{"type":"number"},{"type":"array","items":{"$ref":"#/$defs/JsonValue"}},{"type":"object","additionalProperties":{"$ref":"#/$defs/JsonValue"}}]};
const wrapper0 = {validate: validate40};

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
const _errs0 = errors;
let valid0 = false;
const _errs1 = errors;
if(data !== null){
const err0 = {instancePath,schemaPath:"#/anyOf/0/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
var _valid0 = _errs1 === errors;
valid0 = valid0 || _valid0;
const _errs3 = errors;
if(typeof data !== "boolean"){
const err1 = {instancePath,schemaPath:"#/anyOf/1/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
var _valid0 = _errs3 === errors;
valid0 = valid0 || _valid0;
const _errs5 = errors;
if(typeof data !== "string"){
const err2 = {instancePath,schemaPath:"#/anyOf/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid0 = valid0 || _valid0;
const _errs7 = errors;
if(!((typeof data == "number") && (isFinite(data)))){
const err3 = {instancePath,schemaPath:"#/anyOf/3/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var _valid0 = _errs7 === errors;
valid0 = valid0 || _valid0;
const _errs9 = errors;
if(Array.isArray(data)){
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
if(!(wrapper0.validate(data[i0], {instancePath:instancePath+"/" + i0,parentData:data,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/anyOf/4/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
var items1 = true;
}
const _errs12 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(wrapper0.validate(data[key0], {instancePath:instancePath+"/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data,parentDataProperty:key0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/anyOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid0 = _errs12 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
var props2 = true;
}
if(!valid0){
const err6 = {instancePath,schemaPath:"#/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate40.errors = vErrors;
evaluated0.props = props2;
evaluated0.items = items1;
return errors === 0;
}
validate40.evaluated = {"dynamicProps":true,"dynamicItems":true};


function validate93(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate93.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
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
if(data.method !== undefined){
if("storage.get" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.get"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
const _errs4 = errors;
let valid1 = false;
let passing0 = null;
const _errs5 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.found === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/0/required",keyword:"required",params:{missingProperty: "found"},message:"must have required property '"+"found"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "found")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.found !== undefined){
if(false !== data1.found){
const err6 = {instancePath:instancePath+"/result/found",schemaPath:"#/properties/result/oneOf/0/properties/found/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs5 === errors;
if(_valid0){
valid1 = true;
passing0 = 0;
var props0 = true;
}
const _errs9 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.found === undefined){
const err8 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/1/required",keyword:"required",params:{missingProperty: "found"},message:"must have required property '"+"found"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data1.value === undefined){
const err9 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key2 in data1){
if(!((key2 === "found") || (key2 === "value"))){
const err10 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.found !== undefined){
if(true !== data1.found){
const err11 = {instancePath:instancePath+"/result/found",schemaPath:"#/properties/result/oneOf/1/properties/found/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.value !== undefined){
if(!(validate40(data1.value, {instancePath:instancePath+"/result/value",parentData:data1,parentDataProperty:"value",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err12 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs9 === errors;
if(_valid0 && valid1){
valid1 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid1 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid1){
const err13 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
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
validate93.errors = vErrors;
return errors === 0;
}
validate93.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate92(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageGetResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate92.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate93(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
errors = vErrors.length;
}
validate92.errors = vErrors;
return errors === 0;
}
validate92.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageGetQuotaRequest = validate96;
const schema107 = {"$id":"urn:lensx:plugin-host-api-validator:StorageGetQuotaRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaRequest"};
const schema46 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"storage.get_quota"},"params":{"$ref":"#/$defs/EmptyParams"}}};

function validate97(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate97.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("storage.get_quota" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.get_quota"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
validate97.errors = vErrors;
return errors === 0;
}
validate97.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate96(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageGetQuotaRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate96.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate97(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate97.errors : vErrors.concat(validate97.errors);
errors = vErrors.length;
}
validate96.errors = vErrors;
return errors === 0;
}
validate96.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageGetQuotaResult = validate99;
const schema110 = {"$id":"urn:lensx:plugin-host-api-validator:StorageGetQuotaResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult"};
const schema66 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"storage.get_quota"},"result":{"type":"object","additionalProperties":false,"required":["usedBytes","limitBytes"],"properties":{"usedBytes":{"type":"integer","minimum":0,"maximum":9007199254740991},"limitBytes":{"type":"integer","minimum":1,"maximum":9007199254740991}}}}};

function validate99(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageGetQuotaResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate99.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("storage.get_quota" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/method/const",keyword:"const",params:{allowedValue: "storage.get_quota"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.usedBytes === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/required",keyword:"required",params:{missingProperty: "usedBytes"},message:"must have required property '"+"usedBytes"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.limitBytes === undefined){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/required",keyword:"required",params:{missingProperty: "limitBytes"},message:"must have required property '"+"limitBytes"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "usedBytes") || (key1 === "limitBytes"))){
const err6 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.usedBytes !== undefined){
let data2 = data1.usedBytes;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err7 = {instancePath:instancePath+"/result/usedBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/usedBytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 9007199254740991 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/result/usedBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/usedBytes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2 < 0 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/result/usedBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/usedBytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
if(data1.limitBytes !== undefined){
let data3 = data1.limitBytes;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err10 = {instancePath:instancePath+"/result/limitBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/limitBytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 9007199254740991 || isNaN(data3)){
const err11 = {instancePath:instancePath+"/result/limitBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/limitBytes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data3 < 1 || isNaN(data3)){
const err12 = {instancePath:instancePath+"/result/limitBytes",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/properties/limitBytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
}
else {
const err13 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err14 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageGetQuotaResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate99.errors = vErrors;
return errors === 0;
}
validate99.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageListRequest = validate100;
const schema112 = {"$id":"urn:lensx:plugin-host-api-validator:StorageListRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageListRequest"};
const schema48 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"storage.list"},"params":{"type":"object","additionalProperties":false,"properties":{"cursor":{"$ref":"#/$defs/OpaqueCursor"},"limit":{"type":"integer","minimum":1,"maximum":1000}}}}};
const schema49 = {"type":"string","minLength":1,"maxLength":1024};

function validate101(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate101.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("storage.list" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.list"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
if(!((key1 === "cursor") || (key1 === "limit"))){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data1.cursor !== undefined){
let data2 = data1.cursor;
if(typeof data2 === "string"){
if(func1(data2) > 1024){
const err5 = {instancePath:instancePath+"/params/cursor",schemaPath:"#/$defs/OpaqueCursor/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func1(data2) < 1){
const err6 = {instancePath:instancePath+"/params/cursor",schemaPath:"#/$defs/OpaqueCursor/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err7 = {instancePath:instancePath+"/params/cursor",schemaPath:"#/$defs/OpaqueCursor/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.limit !== undefined){
let data3 = data1.limit;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err8 = {instancePath:instancePath+"/params/limit",schemaPath:"#/properties/params/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 1000 || isNaN(data3)){
const err9 = {instancePath:instancePath+"/params/limit",schemaPath:"#/properties/params/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1000},message:"must be <= 1000"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data3 < 1 || isNaN(data3)){
const err10 = {instancePath:instancePath+"/params/limit",schemaPath:"#/properties/params/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
else {
const err11 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate101.errors = vErrors;
return errors === 0;
}
validate101.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate100(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageListRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate100.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate101(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate101.errors : vErrors.concat(validate101.errors);
errors = vErrors.length;
}
validate100.errors = vErrors;
return errors === 0;
}
validate100.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageListResult = validate103;
const schema115 = {"$id":"urn:lensx:plugin-host-api-validator:StorageListResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageListResult"};
const schema67 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"storage.list"},"result":{"type":"object","additionalProperties":false,"required":["keys"],"properties":{"keys":{"type":"array","maxItems":1000,"uniqueItems":true,"items":{"$ref":"#/$defs/StorageKey"}},"nextCursor":{"$ref":"#/$defs/OpaqueCursor"}}}}};

function validate104(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate104.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
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
if(data.method !== undefined){
if("storage.list" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.list"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.keys === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/required",keyword:"required",params:{missingProperty: "keys"},message:"must have required property '"+"keys"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "keys") || (key1 === "nextCursor"))){
const err5 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.keys !== undefined){
let data2 = data1.keys;
if(Array.isArray(data2)){
if(data2.length > 1000){
const err6 = {instancePath:instancePath+"/result/keys",schemaPath:"#/properties/result/properties/keys/maxItems",keyword:"maxItems",params:{limit: 1000},message:"must NOT have more than 1000 items"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(typeof data3 === "string"){
if(func1(data3) > 256){
const err7 = {instancePath:instancePath+"/result/keys/" + i0,schemaPath:"#/$defs/StorageKey/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data3) < 1){
const err8 = {instancePath:instancePath+"/result/keys/" + i0,schemaPath:"#/$defs/StorageKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern5.test(data3)){
const err9 = {instancePath:instancePath+"/result/keys/" + i0,schemaPath:"#/$defs/StorageKey/pattern",keyword:"pattern",params:{pattern: "^[^\\u0000-\\u001F\\u007F]+$"},message:"must match pattern \""+"^[^\\u0000-\\u001F\\u007F]+$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/result/keys/" + i0,schemaPath:"#/$defs/StorageKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
let i1 = data2.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data2[i1], data2[j0])){
const err11 = {instancePath:instancePath+"/result/keys",schemaPath:"#/properties/result/properties/keys/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err12 = {instancePath:instancePath+"/result/keys",schemaPath:"#/properties/result/properties/keys/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.nextCursor !== undefined){
let data4 = data1.nextCursor;
if(typeof data4 === "string"){
if(func1(data4) > 1024){
const err13 = {instancePath:instancePath+"/result/nextCursor",schemaPath:"#/$defs/OpaqueCursor/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func1(data4) < 1){
const err14 = {instancePath:instancePath+"/result/nextCursor",schemaPath:"#/$defs/OpaqueCursor/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err15 = {instancePath:instancePath+"/result/nextCursor",schemaPath:"#/$defs/OpaqueCursor/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate104.errors = vErrors;
return errors === 0;
}
validate104.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate103(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageListResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate103.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate104(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
errors = vErrors.length;
}
validate103.errors = vErrors;
return errors === 0;
}
validate103.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageSetRequest = validate106;
const schema119 = {"$id":"urn:lensx:plugin-host-api-validator:StorageSetRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetRequest"};
const schema50 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"storage.set"},"params":{"type":"object","additionalProperties":false,"required":["key","value"],"properties":{"key":{"$ref":"#/$defs/StorageKey"},"value":{"$ref":"#/$defs/JsonValue"}}}}};

function validate107(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate107.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("storage.set" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "storage.set"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.key === undefined){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.value === undefined){
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "key") || (key1 === "value"))){
const err6 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.key !== undefined){
let data2 = data1.key;
if(typeof data2 === "string"){
if(func1(data2) > 256){
const err7 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern5.test(data2)){
const err9 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/pattern",keyword:"pattern",params:{pattern: "^[^\\u0000-\\u001F\\u007F]+$"},message:"must match pattern \""+"^[^\\u0000-\\u001F\\u007F]+$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/params/key",schemaPath:"#/$defs/StorageKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.value !== undefined){
if(!(validate40(data1.value, {instancePath:instancePath+"/params/value",parentData:data1,parentDataProperty:"value",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err11 = {instancePath:instancePath+"/params",schemaPath:"#/properties/params/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate107.errors = vErrors;
return errors === 0;
}
validate107.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate106(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageSetRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate106.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate107(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate107.errors : vErrors.concat(validate107.errors);
errors = vErrors.length;
}
validate106.errors = vErrors;
return errors === 0;
}
validate106.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const StorageSetResult = validate110;
const schema122 = {"$id":"urn:lensx:plugin-host-api-validator:StorageSetResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult"};
const schema70 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"storage.set"},"result":{"type":"object","additionalProperties":false,"required":["stored"],"properties":{"stored":{"const":true}}}}};

function validate110(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:StorageSetResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate110.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("storage.set" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/properties/method/const",keyword:"const",params:{allowedValue: "storage.set"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.stored === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/properties/result/required",keyword:"required",params:{missingProperty: "stored"},message:"must have required property '"+"stored"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "stored")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.stored !== undefined){
if(true !== data1.stored){
const err6 = {instancePath:instancePath+"/result/stored",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/properties/result/properties/stored/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err8 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/StorageSetResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate110.errors = vErrors;
return errors === 0;
}
validate110.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const UiCloseRequest = validate111;
const schema124 = {"$id":"urn:lensx:plugin-host-api-validator:UiCloseRequest","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseRequest"};
const schema53 = {"type":"object","additionalProperties":false,"required":["method","params"],"properties":{"method":{"const":"ui.close"},"params":{"$ref":"#/$defs/EmptyParams"}}};

function validate112(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate112.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.params === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "params"},message:"must have required property '"+"params"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "params"))){
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
if(data.method !== undefined){
if("ui.close" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"#/properties/method/const",keyword:"const",params:{allowedValue: "ui.close"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.params !== undefined){
let data1 = data.params;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
for(const key1 in data1){
const err4 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
const err5 = {instancePath:instancePath+"/params",schemaPath:"#/$defs/EmptyParams/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
validate112.errors = vErrors;
return errors === 0;
}
validate112.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate111(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:UiCloseRequest" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate111.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate112(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
errors = vErrors.length;
}
validate111.errors = vErrors;
return errors === 0;
}
validate111.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const UiCloseResult = validate114;
const schema127 = {"$id":"urn:lensx:plugin-host-api-validator:UiCloseResult","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult"};
const schema71 = {"type":"object","additionalProperties":false,"required":["method","result"],"properties":{"method":{"const":"ui.close"},"result":{"type":"object","additionalProperties":false,"required":["accepted"],"properties":{"accepted":{"const":true}}}}};

function validate114(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:UiCloseResult" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate114.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "result"))){
const err2 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.method !== undefined){
if("ui.close" !== data.method){
const err3 = {instancePath:instancePath+"/method",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/properties/method/const",keyword:"const",params:{allowedValue: "ui.close"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.result !== undefined){
let data1 = data.result;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.accepted === undefined){
const err4 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/properties/result/required",keyword:"required",params:{missingProperty: "accepted"},message:"must have required property '"+"accepted"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "accepted")){
const err5 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/properties/result/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.accepted !== undefined){
if(true !== data1.accepted){
const err6 = {instancePath:instancePath+"/result/accepted",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/properties/result/properties/accepted/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
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
const err7 = {instancePath:instancePath+"/result",schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/properties/result/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err8 = {instancePath,schemaPath:"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/UiCloseResult/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate114.errors = vErrors;
return errors === 0;
}
validate114.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const PluginRuntimeContextInput = validate115;
const schema129 = {"$id":"urn:lensx:plugin-host-api-validator:PluginRuntimeContextInput","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/PluginRuntimeContextInput"};

function validate116(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate116.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.hostApiVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hostApiVersion"},message:"must have required property '"+"hostApiVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.locale === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locale"},message:"must have required property '"+"locale"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.theme === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "theme"},message:"must have required property '"+"theme"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.capabilities === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "capabilities"},message:"must have required property '"+"capabilities"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "hostApiVersion") || (key0 === "locale")) || (key0 === "theme")) || (key0 === "capabilities"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hostApiVersion !== undefined){
let data0 = data.hostApiVersion;
if(typeof data0 === "string"){
if(func1(data0) > 255){
const err5 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern8.test(data0)){
const err6 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"+"\""};
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
const err7 = {instancePath:instancePath+"/hostApiVersion",schemaPath:"#/$defs/Semver/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.locale !== undefined){
let data1 = data.locale;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!((data1 === "en-US") || (data1 === "zh-CN"))){
const err9 = {instancePath:instancePath+"/locale",schemaPath:"#/properties/locale/enum",keyword:"enum",params:{allowedValues: schema61.properties.locale.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.theme !== undefined){
let data2 = data.theme;
if(typeof data2 !== "string"){
const err10 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!((data2 === "light") || (data2 === "dark"))){
const err11 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/enum",keyword:"enum",params:{allowedValues: schema61.properties.theme.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.capabilities !== undefined){
let data3 = data.capabilities;
if(Array.isArray(data3)){
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/capabilities/" + i0,schemaPath:"#/$defs/HostApiMethodInput/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((((((((data4 === "actions.open") || (data4 === "clipboard.read")) || (data4 === "clipboard.write")) || (data4 === "runtime.get_context")) || (data4 === "storage.delete")) || (data4 === "storage.get")) || (data4 === "storage.get_quota")) || (data4 === "storage.list")) || (data4 === "storage.set")) || (data4 === "ui.close"))){
const err13 = {instancePath:instancePath+"/capabilities/" + i0,schemaPath:"#/$defs/HostApiMethodInput/enum",keyword:"enum",params:{allowedValues: schema63.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
const err14 = {instancePath:instancePath+"/capabilities",schemaPath:"#/properties/capabilities/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err15 = {instancePath:instancePath+"/capabilities",schemaPath:"#/properties/capabilities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
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
validate116.errors = vErrors;
return errors === 0;
}
validate116.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate115(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:PluginRuntimeContextInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate115.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate116(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
errors = vErrors.length;
}
validate115.errors = vErrors;
return errors === 0;
}
validate115.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const HostApiEventInput = validate118;
const schema133 = {"$id":"urn:lensx:plugin-host-api-validator:HostApiEventInput","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/HostApiEventInput"};
const schema72 = {"type":"object","additionalProperties":false,"required":["event","payload"],"properties":{"event":{"const":"runtime.context_changed"},"payload":{"$ref":"#/$defs/PluginRuntimeContextInput"}}};

function validate119(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate119.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.event === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "event"},message:"must have required property '"+"event"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.payload === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "event") || (key0 === "payload"))){
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
if(data.event !== undefined){
if("runtime.context_changed" !== data.event){
const err3 = {instancePath:instancePath+"/event",schemaPath:"#/properties/event/const",keyword:"const",params:{allowedValue: "runtime.context_changed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.payload !== undefined){
if(!(validate50(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate119.errors = vErrors;
return errors === 0;
}
validate119.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate118(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:HostApiEventInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate118.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate119(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate119.errors : vErrors.concat(validate119.errors);
errors = vErrors.length;
}
validate118.errors = vErrors;
return errors === 0;
}
validate118.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const HostApiErrorInput = validate122;
const schema135 = {"$id":"urn:lensx:plugin-host-api-validator:HostApiErrorInput","$ref":"https://lensx.dev/schemas/plugin-host-api-0.1.0.schema.json#/$defs/HostApiErrorInput"};
const schema73 = {"type":"object","additionalProperties":false,"required":["code","message"],"properties":{"code":{"$ref":"#/$defs/HostApiErrorCodeInput"},"message":{"type":"string","minLength":1,"maxLength":512}}};
const schema74 = {"type":"string","enum":["cancelled","conflict","internal_error","invalid_params","invalid_request","limit_exceeded","method_not_found","not_found","permission_denied","timeout","unavailable"]};

function validate123(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate123.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.code === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.message === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "code") || (key0 === "message"))){
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
if(data.code !== undefined){
let data0 = data.code;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/code",schemaPath:"#/$defs/HostApiErrorCodeInput/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((((((((((data0 === "cancelled") || (data0 === "conflict")) || (data0 === "internal_error")) || (data0 === "invalid_params")) || (data0 === "invalid_request")) || (data0 === "limit_exceeded")) || (data0 === "method_not_found")) || (data0 === "not_found")) || (data0 === "permission_denied")) || (data0 === "timeout")) || (data0 === "unavailable"))){
const err4 = {instancePath:instancePath+"/code",schemaPath:"#/$defs/HostApiErrorCodeInput/enum",keyword:"enum",params:{allowedValues: schema74.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.message !== undefined){
let data1 = data.message;
if(typeof data1 === "string"){
if(func1(data1) > 512){
const err5 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func1(data1) < 1){
const err6 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err7 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate123.errors = vErrors;
return errors === 0;
}
validate123.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate122(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:lensx:plugin-host-api-validator:HostApiErrorInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate122.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(validate123(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate123.errors : vErrors.concat(validate123.errors);
errors = vErrors.length;
}
validate122.errors = vErrors;
return errors === 0;
}
validate122.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validators = { ActionsOpenRequest, ActionsOpenResult, ClipboardReadRequest, ClipboardReadResult, ClipboardWriteRequest, ClipboardWriteResult, RuntimeGetContextRequest, RuntimeGetContextResult, StorageDeleteRequest, StorageDeleteResult, StorageGetRequest, StorageGetResult, StorageGetQuotaRequest, StorageGetQuotaResult, StorageListRequest, StorageListResult, StorageSetRequest, StorageSetResult, UiCloseRequest, UiCloseResult, PluginRuntimeContextInput, HostApiEventInput, HostApiErrorInput } as const;
