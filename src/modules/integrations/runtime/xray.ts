export type XrayCallHandle = {
  phase(name:string):void;
  httpStart(method:string,url:string,requestBody?:string|null): {seq:number;method:string;url:string};
  httpEnd(entry:{seq:number;method:string;url:string},statusCode:number|null,durationMs:number,responseBody?:string|null,error?:string|null):void;
  end(status:"success"|"error",error?:string):void;
};
export const xray = {
  start(input:{kind:string;integrationId:string;actionName:string;projectId?:string;userId?:string;args?:unknown}): XrayCallHandle {
    const started=Date.now();
    return {
      phase(){},
      httpStart(method,url){return {seq:0,method,url};},
      httpEnd(){},
      end(status){console.log("[Integration:XRay] "+status+" "+input.integrationId+"/"+input.actionName+" "+(Date.now()-started)+"ms");},
    };
  },
};
