// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CargofyShipmentAudit
 * @notice Immutable cold-chain audit trail for Cargofy shipments.
 *         Deployed on Ethereum Sepolia Testnet.
 *
 * @dev Each shipment trip gets ONE on-chain certificate minted at journey end.
 *      The certificate records final temperature range, spoilage verdict, and
 *      the Cargofy AI agent's intervention history — immutably on-chain.
 *
 * FAR AWAY 2026 Hackathon — Logistics & Transit × Agentic Systems
 * Contract Address (Sepolia): Deploy via `npx hardhat run scripts/deploy.js --network sepolia`
 */
contract CargofyShipmentAudit {

    // ── Enums ────────────────────────────────────────────────────────────────

    enum Verdict { SAFE, SPOILED, PARTIAL, UNKNOWN }

    // ── Structs ──────────────────────────────────────────────────────────────

    struct ShipmentCertificate {
        string  shipmentCode;       // e.g. "SHP-MH-001"
        string  productType;        // e.g. "milk", "pharma"
        address certifiedBy;        // Cargofy backend wallet address
        uint256 departureTime;      // Unix timestamp
        uint256 arrivalTime;        // Unix timestamp
        int16   minTempTenths;      // Min temp × 10 (e.g. 42 = 4.2°C)
        int16   maxTempTenths;      // Max temp × 10 (e.g. 95 = 9.5°C)
        uint8   maxRiskScore;       // 0-100 (peak risk during journey)
        uint8   rerouteCount;       // How many times AI agent rerouted
        bool    whatsappAlertSent;  // Did driver get WhatsApp alert?
        Verdict verdict;            // Final AI verdict
        string  ipfsMetadataHash;   // IPFS hash of full telemetry log
        uint256 issuedAt;           // Block timestamp of certification
    }

    // ── State ────────────────────────────────────────────────────────────────

    address public owner;
    uint256 public totalCertificates;

    // shipmentCode => certificate
    mapping(string => ShipmentCertificate) public certificates;

    // all shipment codes ever certified
    string[] public allShipmentCodes;

    // authorized certifiers (Cargofy backend wallets)
    mapping(address => bool) public authorizedCertifiers;

    // ── Events ───────────────────────────────────────────────────────────────

    event CertificateIssued(
        string  indexed shipmentCode,
        Verdict verdict,
        uint8   maxRiskScore,
        uint8   rerouteCount,
        address certifiedBy,
        uint256 issuedAt
    );

    event CertifierAdded(address certifier);
    event CertifierRemoved(address certifier);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Cargofy: caller is not owner");
        _;
    }

    modifier onlyCertifier() {
        require(
            authorizedCertifiers[msg.sender] || msg.sender == owner,
            "Cargofy: caller is not an authorized certifier"
        );
        _;
    }

    modifier notAlreadyCertified(string calldata shipmentCode) {
        require(
            certificates[shipmentCode].issuedAt == 0,
            "Cargofy: shipment already certified"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        authorizedCertifiers[msg.sender] = true;
        emit CertifierAdded(msg.sender);
    }

    // ── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Issue an immutable shipment integrity certificate.
     * @dev Called by Cargofy backend at end of each simulated/real trip.
     *      Once issued, the certificate CANNOT be modified or deleted.
     *
     * @param shipmentCode     Unique shipment identifier (e.g. "SHP-MH-001")
     * @param productType      Product category (e.g. "milk", "pharma")
     * @param departureTime    Unix timestamp of trip start
     * @param arrivalTime      Unix timestamp of trip end
     * @param minTempTenths    Minimum recorded temperature × 10
     * @param maxTempTenths    Maximum recorded temperature × 10
     * @param maxRiskScore     Peak risk score (0–100) during trip
     * @param rerouteCount     Number of AI-triggered reroutes
     * @param whatsappSent     Whether driver received WhatsApp alert
     * @param verdict          Final integrity verdict (SAFE/SPOILED/PARTIAL)
     * @param ipfsHash         IPFS CID of full telemetry log JSON
     */
    function issueCertificate(
        string  calldata shipmentCode,
        string  calldata productType,
        uint256 departureTime,
        uint256 arrivalTime,
        int16   minTempTenths,
        int16   maxTempTenths,
        uint8   maxRiskScore,
        uint8   rerouteCount,
        bool    whatsappSent,
        Verdict verdict,
        string  calldata ipfsHash
    )
        external
        onlyCertifier
        notAlreadyCertified(shipmentCode)
    {
        certificates[shipmentCode] = ShipmentCertificate({
            shipmentCode:      shipmentCode,
            productType:       productType,
            certifiedBy:       msg.sender,
            departureTime:     departureTime,
            arrivalTime:       arrivalTime,
            minTempTenths:     minTempTenths,
            maxTempTenths:     maxTempTenths,
            maxRiskScore:      maxRiskScore,
            rerouteCount:      rerouteCount,
            whatsappAlertSent: whatsappSent,
            verdict:           verdict,
            ipfsMetadataHash:  ipfsHash,
            issuedAt:          block.timestamp
        });

        allShipmentCodes.push(shipmentCode);
        totalCertificates++;

        emit CertificateIssued(
            shipmentCode,
            verdict,
            maxRiskScore,
            rerouteCount,
            msg.sender,
            block.timestamp
        );
    }

    // ── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Verify a shipment's integrity certificate.
     * @return exists      Whether certificate has been issued
     * @return verdict     SAFE | SPOILED | PARTIAL | UNKNOWN
     * @return maxRisk     Peak risk score 0-100
     * @return reroutes    Number of AI agent reroutes
     * @return issuedAt    Block timestamp of certification
     */
    function verifyCertificate(string calldata shipmentCode)
        external
        view
        returns (
            bool    exists,
            Verdict verdict,
            uint8   maxRisk,
            uint8   reroutes,
            uint256 issuedAt,
            address certifiedBy
        )
    {
        ShipmentCertificate storage cert = certificates[shipmentCode];
        exists      = cert.issuedAt > 0;
        verdict     = cert.verdict;
        maxRisk     = cert.maxRiskScore;
        reroutes    = cert.rerouteCount;
        issuedAt    = cert.issuedAt;
        certifiedBy = cert.certifiedBy;
    }

    /**
     * @notice Get full certificate details for a shipment.
     */
    function getCertificate(string calldata shipmentCode)
        external
        view
        returns (ShipmentCertificate memory)
    {
        require(certificates[shipmentCode].issuedAt > 0, "Cargofy: certificate not found");
        return certificates[shipmentCode];
    }

    /**
     * @notice Get total number of certified shipments.
     */
    function getTotalCertificates() external view returns (uint256) {
        return totalCertificates;
    }

    /**
     * @notice Get all certified shipment codes (paginated).
     */
    function getShipmentCodes(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory)
    {
        uint256 end = offset + limit;
        if (end > allShipmentCodes.length) end = allShipmentCodes.length;
        string[] memory result = new string[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allShipmentCodes[i];
        }
        return result;
    }

    // ── Admin Functions ──────────────────────────────────────────────────────

    function addCertifier(address certifier) external onlyOwner {
        authorizedCertifiers[certifier] = true;
        emit CertifierAdded(certifier);
    }

    function removeCertifier(address certifier) external onlyOwner {
        require(certifier != owner, "Cargofy: cannot remove owner");
        authorizedCertifiers[certifier] = false;
        emit CertifierRemoved(certifier);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Cargofy: zero address");
        owner = newOwner;
    }
}
