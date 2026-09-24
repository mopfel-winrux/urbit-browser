import { twice } from "./util.js";
export function greet(name){ return "hello " + name; }
let n = 0;
export const counter = () => ++n + twice(0);
export default class Thing {}
