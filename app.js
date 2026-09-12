let streamActivo = null;
let modoActualEscanner = null; 
let codigoEscaneadoTemp = "";

// Variables globales para la validación con XML
let ordenCompraActual = {}; 
let xmlCargadoValido = false;

function cambiarSeccion(seccionId, evento) {
  document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

  document.getElementById(seccionId).classList.add('active');
  evento.currentTarget.classList.add('active');

  detenerCamara();
  if (seccionId === 'entradas') {
    if (xmlCargadoValido) {
      iniciarCamara('entrada');
    }
  } else if (seccionId === 'salidas') {
    iniciarCamara('salida');
  } else if (seccionId === 'actual') {
    cambiarVistaInventario('stock');
  } else if (seccionId === 'mercancia') {
    cargarHistorialMercancia();
  }
}

// Control de vistas en Inventario (Stock / Catálogo QR General)
function cambiarVistaInventario(vista) {
  const btnStock = document.getElementById("btn-vista-stock");
  const btnCatalogo = document.getElementById("btn-vista-catalogo");
  const divStock = document.getElementById("subseccion-stock");
  const divCatalogo = document.getElementById("subseccion-catalogo");

  if (!btnStock || !btnCatalogo || !divStock || !divCatalogo) return;

  if (vista === 'stock') {
    btnStock.style.background = "#3498db";
    btnCatalogo.style.background = "#95a5a6";
    divStock.style.display = "block";
    divCatalogo.style.display = "none";
    cargarInventarioActual();
  } else {
    btnStock.style.background = "#95a5a6";
    btnCatalogo.style.background = "#3498db";
    divStock.style.display = "none";
    divCatalogo.style.display = "block";
    cargarCatalogoGeneralQR();
  }
}

// 1. PROCESAR EL ARCHIVO XML DE LA ORDEN DE COMPRA
function procesarXMLOrdenCompra(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = function(e) {
    try {
      const contenidoTexto = e.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(contenidoTexto, "text/xml");

      let items = xmlDoc.getElementsByTagName("Concepto");
      if (items.length === 0) items = xmlDoc.getElementsByTagName("Item");
      if (items.length === 0) items = xmlDoc.getElementsByTagName("producto");

      ordenCompraActual = {};
      let htmlResumen = "<strong>Productos en la Orden:</strong><ul style='margin: 5px 0 0 20px; padding:0;'>";

      if (items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const codigo = item.getAttribute("NoIdentificacion") || item.getAttribute("codigo") || `SKU-${i+1}`;
          const descripcion = item.getAttribute("Descripcion") || item.getAttribute("nombre") || "Artículo sin descripción";
          const cantidad = parseFloat(item.getAttribute("Cantidad") || item.getAttribute("cantidad") || 1);

          ordenCompraActual[codigo] = {
            nombre: descripcion,
            cantidadEsperada: cantidad,
            cantidadEscaneada: 0
          };

          htmlResumen += `<li><b>${codigo}</b> - ${descripcion} (Esperados: <b>${cantidad}</b>)</li>`;
        }
      } else {
        alert("No se detectaron nodos de productos estándar (Concepto/Item) en el XML.");
        return;
      }

      htmlResumen += "</ul>";
      document.getElementById("resumen-xml").innerHTML = htmlResumen;
      
      document.getElementById("contenedor-escanner-entradas").style.display = "block";
      xmlCargadoValido = true;
      
      iniciarCamara('entrada');
      alert("¡Orden de compra cargada con éxito! Ya puedes escanear.");

    } catch (error) {
      console.error("Error al parsear el XML:", error);
      alert("Hubo un error al leer el archivo XML.");
    }
  };
  lector.readAsText(archivo);
}

// 2. GUARDAR NUEVO PRODUCTO EN FIRESTORE (Sin mostrar QR en esta pantalla)
async function guardarNuevoProducto() {
  const codigo = document.getElementById("codigo-reg").value.trim();
  const nombre = document.getElementById("nombre-reg").value.trim();
  
  if (!codigo || !nombre) {
    alert("Por favor completa el código y el nombre del producto.");
    return;
  }

  try {
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    await setDoc(doc(window.db, "productos", codigo), {
      codigo: codigo,
      nombre: nombre,
      stock: 0,
      fechaCreacion: new Date()
    });

    alert(`¡Producto "${nombre}" registrado con éxito! Su código QR ya está disponible en el Inventario General.`);
    
    // Limpiamos los campos
    document.getElementById("codigo-reg").value = "";
    document.getElementById("nombre-reg").value = "";
    
  } catch (error) {
    console.error("Error al guardar producto: ", error);
    alert("Hubo un error al guardar en la base de datos.");
  }
}

function iniciarCamara(tipo) {
  modoActualEscanner = tipo;
  const videoElement = document.getElementById(tipo === 'entrada' ? 'video-entrada' : 'video-salida');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      streamActivo = stream;
      videoElement.srcObject = stream;
      videoElement.play();
      requestAnimationFrame(() => bucleEscaneo(tipo));
    })
    .catch(err => {
      alert("Error al acceder a la cámara: " + err);
    });
}

function detenerCamara() {
  if (streamActivo) {
    streamActivo.getTracks().forEach(track => track.stop());
    streamActivo = null;
  }
}

function bucleEscaneo(tipo) {
  if (modoActualEscanner !== tipo) return;

  const videoElement = document.getElementById(tipo === 'entrada' ? 'video-entrada' : 'video-salida');
  const resultadoElement = document.getElementById(tipo === 'entrada' ? 'resultado-entrada' : 'resultado-salida');

  if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code) {
      codigoEscaneadoTemp = code.data;
      resultadoElement.textContent = "¡Código detectado: " + code.data + "!";
      
      if (tipo === 'entrada') {
        document.getElementById('lbl-prod-entrada').textContent = code.data;
        
        if (ordenCompraActual[code.data]) {
          document.getElementById('lbl-cant-xml').textContent = ordenCompraActual[code.data].cantidadEsperada;
          document.getElementById('lbl-cant-scan').textContent = ordenCompraActual[code.data].cantidadEscaneada;
          document.getElementById('cantidad-entrada').value = (ordenCompraActual[code.data].cantidadEsperada - ordenCompraActual[code.data].cantidadEscaneada) > 0 ? 
            (ordenCompraActual[code.data].cantidadEsperada - ordenCompraActual[code.data].cantidadEscaneada) : 1;
        } else {
          document.getElementById('lbl-cant-xml').textContent = "No listado en XML";
          document.getElementById('lbl-cant-scan').textContent = "-";
        }

        document.getElementById('panel-confirmar-entrada').style.display = 'block';
      } else {
        document.getElementById('lbl-prod-salida').textContent = code.data;
        document.getElementById('panel-confirmar-salida').style.display = 'block';
      }
      return; 
    }
  }

  if (streamActivo) {
    requestAnimationFrame(() => bucleEscaneo(tipo));
  }
}

function reiniciarEscaneo(tipo) {
  if (tipo === 'entrada') {
    document.getElementById('resultado-entrada').textContent = "Esperando escaneo de entrada...";
    document.getElementById('panel-confirmar-entrada').style.display = 'none';
  } else {
    document.getElementById('resultado-salida').textContent = "Esperando escaneo de salida...";
    document.getElementById('panel-confirmar-salida').style.display = 'none';
  }
  codigoEscaneadoTemp = "";
  requestAnimationFrame(() => bucleEscaneo(tipo));
}

// 3. CONFIRMAR ENTRADA EN LA NUBE
async function confirmarEntrada() {
  const cantidad = parseInt(document.getElementById("cantidad-entrada").value);
  if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad válida.");

  if (xmlCargadoValido && !ordenCompraActual[codigoEscaneadoTemp]) {
    const continuar = confirm(`¡Advertencia! El código "${codigoEscaneadoTemp}" NO se encuentra en la Orden de Compra XML. ¿Deseas agregarlo de todas formas?`);
    if (!continuar) return;
  } else if (xmlCargadoValido && ordenCompraActual[codigoEscaneadoTemp]) {
    ordenCompraActual[codigoEscaneadoTemp].cantidadEscaneada += cantidad;
  }

  try {
    const { doc, getDoc, updateDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    const prodRef = doc(window.db, "productos", codigoEscaneadoTemp);
    const prodSnap = await getDoc(prodRef);

    let nombreProducto = ordenCompraActual[codigoEscaneadoTemp]?.nombre || codigoEscaneadoTemp;
    if (prodSnap.exists()) {
      const data = prodSnap.data();
      nombreProducto = data.nombre || nombreProducto;
      const stockActual = data.stock || 0;
      await updateDoc(prodRef, { stock: stockActual + cantidad });
    } else {
      await updateDoc(prodRef, { codigo: codigoEscaneadoTemp, nombre: nombreProducto, stock: cantidad });
    }

    await addDoc(collection(window.db, "movimientos"), {
      tipo: "ENTRADA (XML)",
      codigo: codigoEscaneadoTemp,
      nombre: nombreProducto,
      cantidad: cantidad,
      fecha: new Date().toLocaleString()
    });

    alert(`[Entrada Exitosa] Se agregaron ${cantidad} unidades de "${nombreProducto}" a la nube.`);
    reiniciarEscaneo('entrada');
  } catch (error) {
    console.error("Error al registrar entrada:", error);
    alert("Error al conectar con la base de datos.");
  }
}

// 4. CONFIRMAR SALIDA EN LA NUBE
async function confirmarSalida() {
  const cantidad = parseInt(document.getElementById("cantidad-salida").value);
  if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad válida.");

  try {
    const { doc, getDoc, updateDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    const prodRef = doc(window.db, "productos", codigoEscaneadoTemp);
    const prodSnap = await getDoc(prodRef);

    let nombreProducto = codigoEscaneadoTemp;
    if (prodSnap.exists()) {
      const data = prodSnap.data();
      nombreProducto = data.nombre;
      const stockActual = data.stock || 0;
      
      if (stockActual < cantidad) {
        alert(`¡Advertencia! No hay suficiente stock. Stock actual: ${stockActual}`);
        return;
      }

      await updateDoc(prodRef, { stock: stockActual - cantidad });
    }

    await addDoc(collection(window.db, "movimientos"), {
      tipo: "SALIDA",
      codigo: codigoEscaneadoTemp,
      nombre: nombreProducto,
      cantidad: cantidad,
      fecha: new Date().toLocaleString()
    });

    alert(`[Salida Registrada] Se retiraron ${cantidad} unidades de "${nombreProducto}".`);
    reiniciarEscaneo('salida');
  } catch (error) {
    console.error("Error al registrar salida:", error);
    alert("Error al procesar la salida.");
  }
}

// 5. CARGAR INVENTARIO ACTUAL (Stock)
async function cargarInventarioActual() {
  const contenedor = document.getElementById("lista-inventario");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando inventario desde la nube...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "productos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos registrados.</p>";
      return;
    }

    let html = "<ul style='list-style: none; padding: 0;'>";
    let contadorConStock = 0;

    querySnapshot.forEach((doc) => {
      const prod = doc.data();
      const stock = prod.stock || 0;

      // FILTRO: Solo mostrar si el stock es mayor a 0
      if (stock > 0) {
        contadorConStock++;
        html += `<li style='background: #f9f9f9; margin-bottom: 8px; padding: 10px; border-radius: 4px; border-left: 4px solid #3498db;'>
          <strong>${prod.nombre}</strong> (${prod.codigo})<br>
          Stock Actual: <span style='font-size: 1.1em; color: #2c3e50; font-weight: bold;'>${stock}</span>
        </li>`;
      }
    });

    if (contadorConStock === 0) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos con stock disponible en este momento (todos están en 0).</p>";
      return;
    }

    html += "</ul>";
    contenedor.innerHTML = html;
  } catch (error) {
    console.error("Error cargando inventario:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar las existencias.</p>";
  }
}

// 5.1. CARGAR CATÁLOGO GENERAL Y GENERAR SUS QR
async function cargarCatalogoGeneralQR() {
  const contenedor = document.getElementById("lista-catalogo-qr");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando catálogo general...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "productos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No hay productos registrados en el sistema.</p>";
      return;
    }

    let html = "<div style='display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px;'>";
    const productosArray = [];
    querySnapshot.forEach((docSnap) => {
      productosArray.push(docSnap.data());
    });

    productosArray.forEach((prod, index) => {
      html += `
        <div style='background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);'>
          <h4 style='margin: 0 0 5px 0; color: #2c3e50;'>${prod.nombre}</h4>
          <p style='margin: 0 0 10px 0; font-size: 0.9em; color: #7f8c8d;'>SKU: <b>${prod.codigo}</b></p>
          <div style='display: flex; justify-content: center; margin-bottom: 8px;'>
            <canvas id='qr-catalogo-${index}'></canvas>
          </div>
          <p style='margin: 0; font-size: 0.85em;'>Stock: ${prod.stock || 0}</p>
        </div>
      `;
    });

    html += "</div>";
    contenedor.innerHTML = html;

    productosArray.forEach((prod, index) => {
      const canvasElement = document.getElementById(`qr-catalogo-${index}`);
      if (canvasElement && window.QRCode) {
        QRCode.toCanvas(canvasElement, prod.codigo, { width: 130 }, function (err) {
          if (err) console.error("Error generando QR para " + prod.codigo, err);
        });
      }
    });

  } catch (error) {
    console.error("Error cargando catálogo general:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar el catálogo general.</p>";
  }
}

// 6. CARGAR HISTORIAL DE MERCANCÍA / MOVIMIENTOS
async function cargarHistorialMercancia() {
  const contenedor = document.getElementById("lista-mercancia");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando historial...</p>";

  try {
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const querySnapshot = await getDocs(collection(window.db, "movimientos"));

    if (querySnapshot.empty) {
      contenedor.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>Sin movimientos registrados aún.</p>";
      return;
    }

    let html = "<ul style='list-style: none; padding: 0;'>";
    querySnapshot.forEach((doc) => {
      const mov = doc.data();
      const colorBorde = mov.tipo.includes("ENTRADA") ? "#2ecc71" : "#e74c3c";
      html += `<li style='background: #f9f9f9; margin-bottom: 8px; padding: 10px; border-radius: 4px; border-left: 4px solid ${colorBorde};'>
        <strong>[${mov.tipo}]</strong> ${mov.nombre} (${mov.codigo})<br>
        Cantidad: ${mov.cantidad} — <small style='color: gray;'>${mov.fecha}</small>
      </li>`;
    });
    html += "</ul>";
    contenedor.innerHTML = html;
  } catch (error) {
    console.error("Error cargando movimientos:", error);
    contenedor.innerHTML = "<p style='color: red;'>Error al cargar el historial.</p>";
  }
}