async function enviarCorreoStockCritico() {

    try {

        const {
            collection,
            getDocs,
            doc,
            updateDoc
        } = await import(
            "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );

        const snapshot =
            await getDocs(
                collection(
                    window.db,
                    "productos"
                )
            );

        const productosCriticos = [];
        let existeAlertaNueva = false;

        snapshot.forEach(doc => {

            const prod = doc.data();

            const stock =
                prod.stock || 0;

            const stockMinimo =
                prod.stockMinimo || 0;

            const correoEnviado =
                prod.correoEnviado || false;

            if (
                stockMinimo > 0 &&
                stock <= stockMinimo
                    
            ) {
                if (!correoEnviado) {
                    
                        existeAlertaNueva = true;
                    
                    }

                productosCriticos.push(

                `${prod.nombre}
                Código: ${prod.codigo}
                Stock actual: ${stock}
                Stock mínimo: ${stockMinimo}`

                );

            }

        });

        if (
            productosCriticos.length === 0
        ) {

            return;

        }

        const mensaje =

            productosCriticos.join(
                "\n\n"
            );

        if (!existeAlertaNueva) {
         
            return;
         
        }
        await emailjs.send(

            "service_wqy7v3u",

            "template_ehqxccn",

            {

                productos:
                    mensaje

            }

        );
        for (const docSnap of snapshot.docs) {
         
            const prod =
                docSnap.data();
         
            const stock =
                prod.stock || 0;
         
            const stockMinimo =
                prod.stockMinimo || 0;
         
            if (
                stockMinimo > 0 &&
                stock <= stockMinimo
            ) {
         
                await updateDoc(
         
                    doc(
                        window.db,
                        "productos",
                        docSnap.id
                    ),
         
                    {
         
                        correoEnviado: true
         
                    }
         
                );
         
            }
         
        }

        console.log(
            "Correo enviado correctamente."
        );

    }

    catch(error) {

        console.error(
            "Error EmailJS:",
            error
        );

    }

}