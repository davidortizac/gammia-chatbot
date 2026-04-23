terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Red y Rango Privado (VPC)
resource "google_compute_network" "gamma_vpc" {
  name                    = "gamma-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "gamma_subnet" {
  name          = "gamma-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.gamma_vpc.id
  # Permitir conexiones a Google APIs (Vertex, etc) sin IP pública
  private_ip_google_access = true 
}

# 2. Configuración de IP Privada para Cloud SQL
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "gamma-sql-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.gamma_vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.gamma_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# 3. Instancia de Base de Datos Analítica y Vectorial (Cloud SQL + pgvector)
resource "google_sql_database_instance" "gammia_db_instance" {
  name             = "gammia-pg-cluster"
  database_version = "POSTGRES_15"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier = "db-f1-micro" # Para desarrollo. Subir en Prod.
    ip_configuration {
      ipv4_enabled    = false # Completamente privada
      private_network = google_compute_network.gamma_vpc.id
    }
    
    # Habilitar extension pgvector por defecto
    database_flags {
      name  = "cloudsql.enable_pgvector"
      value = "on"
    }
  }
}

# Base de datos lógica
resource "google_sql_database" "gammia_db" {
  name     = "gammiadb"
  instance = google_sql_database_instance.gammia_db_instance.name
}

# Usuario Maestro (Recordar gestionar la pass en Secret Manager posteriormente)
resource "google_sql_user" "gammia_usr" {
  name     = "gamma_admin"
  instance = google_sql_database_instance.gammia_db_instance.name
  password = var.db_password 
}
