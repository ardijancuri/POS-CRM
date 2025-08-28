declare module 'quagga' {
  export default Quagga;
  
  interface Quagga {
    init: (config: any, callback: (err: any) => void) => void;
    start: () => void;
    stop: () => void;
    onDetected: (callback: (result: any) => void) => void;
    offDetected: (callback: (result: any) => void) => void;
  }
}
