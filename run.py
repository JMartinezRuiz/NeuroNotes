from app import create_app

app = create_app()

if __name__ == "__main__":
    # Escuchar en todas las interfaces (0.0.0.0) para que sea accesible desde otros dispositivos en la red
    app.run(debug=True, host='0.0.0.0', port=5000)