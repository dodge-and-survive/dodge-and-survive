// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract StakeAndSurvive {

    uint256 public constant SUBSCRIPTION_FEE      = 4_990_000;
    uint256 public constant CODE_VALIDITY         = 3 days;
    uint256 public constant WINNERS_COUNT         = 5;
    uint256 public constant PRIZE_SHARE           = 80;
    uint256 public constant MAX_XP_PER_CLAIM      = 200;
    uint256 public constant CLAIM_COOLDOWN        = 20 hours;
    uint256 public constant WEEKLY_CLAIM_WINDOW   = 48 hours;

    address public owner;
    address public pendingOwner;
    IERC20  public immutable USDC;
    bool private _locked;

    struct Subscription {
        uint256 expiresAt;
        bool    active;
    }

    struct GameCode {
        address owner;
        uint256 expiresAt;
        bool    used;
    }

    struct WeeklyReward {
        uint256 xpAmount;
        uint256 claimableFrom;
        uint256 claimableUntil;
        bool    claimed;
    }

    mapping(address => Subscription)   public subscriptions;
    mapping(bytes32  => GameCode)       public gameCodes;
    mapping(address  => uint256)        public points;
    mapping(address  => uint256)        public balance;
    mapping(address  => uint256)        public lastClaimTime;
    mapping(address  => uint256)        public claimNonce;
    mapping(address  => WeeklyReward)   public weeklyRewards;
    mapping(address  => uint256)        public weeklyRewardNonce;

    uint256 public prizePool;
    uint256 public platformBalance;

    event Subscribed(address indexed user, uint256 expiresAt);
    event CodeGenerated(address indexed user, bytes32 code, uint256 expiresAt);
    event CodeUsed(bytes32 indexed code, address indexed user);
    event WinnersPaid(address[5] winners, uint256 amountEach);
    event Withdrawal(address indexed user, uint256 amount);
    event DailyXPClaimed(address indexed user, uint256 xpAmount, uint256 nonce);
    event WeeklyRewardSet(address indexed user, uint256 xpAmount, uint256 claimableFrom, uint256 claimableUntil);
    event WeeklyRewardClaimed(address indexed user, uint256 xpAmount);
    event OwnershipTransferInitiated(address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC");
        owner = msg.sender;
        USDC  = IERC20(_usdc);
    }

    function subscribe() external nonReentrant {
        bool ok = USDC.transferFrom(msg.sender, address(this), SUBSCRIPTION_FEE);
        require(ok, "USDC transfer failed");
        uint256 expiry = block.timestamp + 7 days;
        subscriptions[msg.sender] = Subscription({ expiresAt: expiry, active: true });
        uint256 toPrize    = (SUBSCRIPTION_FEE * PRIZE_SHARE) / 100;
        uint256 toPlatform = SUBSCRIPTION_FEE - toPrize;
        prizePool       += toPrize;
        platformBalance += toPlatform;
        for (uint256 i = 0; i < 2; i++) {
            bytes32 code = keccak256(abi.encodePacked(msg.sender, block.timestamp, i, block.prevrandao));
            gameCodes[code] = GameCode({ owner: msg.sender, expiresAt: block.timestamp + CODE_VALIDITY, used: false });
            emit CodeGenerated(msg.sender, code, block.timestamp + CODE_VALIDITY);
        }
        emit Subscribed(msg.sender, expiry);
    }

    function useCode(bytes32 code) external {
        GameCode storage gc = gameCodes[code];
        require(!gc.used, "Code already used");
        require(block.timestamp <= gc.expiresAt, "Code expired");
        gc.used = true;
        emit CodeUsed(code, msg.sender);
    }

    // ── Daily XP Claim ─────────────────────────────────────
    function claimDailyXP(uint256 xpAmount, bytes calldata signature) external nonReentrant {
        require(xpAmount > 0, "XP must be > 0");
        require(xpAmount <= MAX_XP_PER_CLAIM, "Exceeds max XP");
        require(block.timestamp >= lastClaimTime[msg.sender] + CLAIM_COOLDOWN, "Cooldown active");
        uint256 nonce   = claimNonce[msg.sender];
        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, xpAmount, nonce, address(this)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        address signer  = _recover(ethHash, signature);
        require(signer == owner, "Invalid signature");
        lastClaimTime[msg.sender]  = block.timestamp;
        claimNonce[msg.sender]     = nonce + 1;
        points[msg.sender]        += xpAmount;
        emit DailyXPClaimed(msg.sender, xpAmount, nonce);
    }

    // ── Weekly Reward Claim ─────────────────────────────────
    /**
     * @notice Owner sets weekly reward for a top-5 player after week ends.
     *         Claimable window: 48 hours from when owner sets it.
     */
    function setWeeklyReward(
        address user,
        uint256 xpAmount,
        bytes calldata signature
    ) external nonReentrant {
        require(user != address(0), "Invalid user");
        require(xpAmount > 0, "XP must be > 0");

        // Verify owner signed this reward
        uint256 nonce   = weeklyRewardNonce[user];
        bytes32 msgHash = keccak256(abi.encodePacked(user, xpAmount, nonce, address(this)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        address signer  = _recover(ethHash, signature);
        require(signer == owner, "Invalid signature");

        uint256 claimableFrom  = block.timestamp;
        uint256 claimableUntil = block.timestamp + WEEKLY_CLAIM_WINDOW;

        weeklyRewards[user] = WeeklyReward({
            xpAmount:       xpAmount,
            claimableFrom:  claimableFrom,
            claimableUntil: claimableUntil,
            claimed:        false
        });
        weeklyRewardNonce[user]++;

        emit WeeklyRewardSet(user, xpAmount, claimableFrom, claimableUntil);
    }

    /**
     * @notice Top-5 player claims their weekly XP reward.
     *         Must be within the 48-hour claim window.
     */
    function claimWeeklyReward() external nonReentrant {
        WeeklyReward storage wr = weeklyRewards[msg.sender];
        require(wr.xpAmount > 0,                          "No reward available");
        require(!wr.claimed,                              "Already claimed");
        require(block.timestamp >= wr.claimableFrom,      "Not claimable yet");
        require(block.timestamp <= wr.claimableUntil,     "Claim window expired");

        wr.claimed = true;
        points[msg.sender] += wr.xpAmount;

        emit WeeklyRewardClaimed(msg.sender, wr.xpAmount);
    }

    function getWeeklyReward(address user) external view returns (
        uint256 xpAmount,
        uint256 claimableFrom,
        uint256 claimableUntil,
        bool claimed
    ) {
        WeeklyReward memory wr = weeklyRewards[user];
        return (wr.xpAmount, wr.claimableFrom, wr.claimableUntil, wr.claimed);
    }

    function canClaimWeekly(address user) external view returns (bool) {
        WeeklyReward memory wr = weeklyRewards[user];
        return wr.xpAmount > 0
            && !wr.claimed
            && block.timestamp >= wr.claimableFrom
            && block.timestamp <= wr.claimableUntil;
    }

    // ── Views ───────────────────────────────────────────────
    function isSubscribed(address user) external view returns (bool) {
        return subscriptions[user].active && subscriptions[user].expiresAt > block.timestamp;
    }

    function getSubscription(address user) external view returns (uint256 expiresAt, bool active) {
        Subscription memory s = subscriptions[user];
        return (s.expiresAt, s.active && s.expiresAt > block.timestamp);
    }

    function getClaimNonce(address user) external view returns (uint256) {
        return claimNonce[user];
    }

    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= lastClaimTime[user] + CLAIM_COOLDOWN;
    }

    // ── Owner functions ─────────────────────────────────────
    function addPoints(address user, uint256 amount) external onlyOwner {
        points[user] += amount;
    }

    function payMonthlyWinners(address[5] calldata winners) external onlyOwner nonReentrant {
        uint256 total = prizePool;
        require(total > 0, "Empty prize pool");
        prizePool = 0;
        uint256 each = total / WINNERS_COUNT;
        for (uint256 i = 0; i < WINNERS_COUNT; i++) {
            require(winners[i] != address(0), "Invalid winner");
            balance[winners[i]] += each;
        }
        emit WinnersPaid(winners, each);
    }

    function withdraw() external nonReentrant {
        uint256 amount = balance[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        balance[msg.sender] = 0;
        bool ok = USDC.transfer(msg.sender, amount);
        require(ok, "Transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    function withdrawPlatform(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        uint256 amount = platformBalance;
        require(amount > 0, "Nothing to withdraw");
        platformBalance = 0;
        bool ok = USDC.transfer(to, amount);
        require(ok, "Transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        require(v == 27 || v == 28, "Invalid v");
        address recovered = ecrecover(hash, v, r, s);
        require(recovered != address(0), "Invalid signature");
        return recovered;
    }

    receive() external payable { revert("No ETH accepted"); }
    fallback() external payable { revert("No ETH accepted"); }
}
