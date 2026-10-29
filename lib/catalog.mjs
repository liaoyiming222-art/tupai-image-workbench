// RunningHub's exact model pages selected by the user. These are economy channels.
export const RUNNINGHUB_BASE='https://www.runninghub.ai';
export const CATALOG_VERSION=2;
export const MODEL_BINDINGS={'局部重绘-Gemini':'gemini','局部重绘-gpt':'gpt'};
export const defaultProviders=()=>[
  {id:'gemini',name:'Nano Banana 2',category:'局部重绘-Gemini',type:'model',submitPath:'/openapi/v2/rhart-image-n-g31-flash/image-to-image',queryPath:'/openapi/v2/query',params:{resolution:'1k'},maxImages:10,maxImageBytes:30*1024*1024,maxPromptLength:20000,allowedAspectRatios:['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','21:9','1:4','4:1','1:8','8:1'],referenceStyle:'at',promptTemplate:'{{prompt}}',outputIndex:0,docUrl:'https://www.runninghub.ai/zh-cn/call-api/api-detail/2027196343409463297'},
  {id:'gpt',name:'GPT Image 2.0',category:'局部重绘-gpt',type:'model',submitPath:'/openapi/v2/rhart-image-g-2/image-to-image',queryPath:'/openapi/v2/query',params:{resolution:'1k'},maxImages:10,maxImageBytes:50*1024*1024,maxPromptLength:20000,allowedAspectRatios:['1:1','2:3','3:2','4:5','5:4','4:3','3:4','16:9','9:16','21:9','9:21','2:1','1:2','3:1','1:3'],referenceStyle:'at',promptTemplate:'{{prompt}}',outputIndex:0,docUrl:'https://www.runninghub.ai/zh-cn/call-api/api-detail/2046503667076751361'}
];
